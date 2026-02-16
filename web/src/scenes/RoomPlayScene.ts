import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { GuessInput } from "@/components/GuessInput";
import { MusicToggle } from "@/components/MusicToggle";
import { BackButton } from "@/components/BackButton";
import { BackpackButton } from "@/components/BackpackButton";
import { BackpackModal } from "@/components/BackpackModal";
import { RoomClient, type RoomRole, type RoomRule } from "@/room/client";
import { inventoryToItemData } from "@/data/pvpItems";

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

const TURN_SEC = 60;

export interface RoomPlaySceneOptions {
  app: Application;
  client: RoomClient;
  myRole: RoomRole;
  initialTurn: RoomRole;
  turnStartAt: number;
  rule: RoomRule;
  myCode: string; // 自己设置的密码
  joinUrl?: string;
  inventory?: { [itemId: string]: number }; // 初始道具背包
  onBack: () => void;
  /** 重连时的历史记录 */
  history?: {
    role: RoomRole;
    guess: string;
    result: string;
    timestamp: number;
  }[];
}

export class RoomPlayScene extends Container {
  private app: Application;
  private turnText: Text;
  private countdownText: Text;
  private guessInput: GuessInput;
  private myHistoryText: Text;
  private peerHistoryText: Text;
  private resultText: Text;
  private client: RoomClient;
  private myRole: RoomRole;
  private turn: RoomRole;
  private turnStartAt: number;
  private unsub: (() => void) | null = null;
  private myHistory: string[] = [];
  private peerHistory: string[] = [];
  private tickerId: ReturnType<typeof setInterval> | null = null;
  private timeoutReported = false;
  private gameOver = false;
  private gameOverOverlay: Container | null = null;
  private gameOverStartTime = 0;
  private gameOverParticles: Particle[] = [];
  private gameOverTickerBound: ((ticker: { deltaMS: number }) => void) | null = null;
  private rule: RoomRule;
  private inventory: { [itemId: string]: number } = {};
  private backpackButton: BackpackButton | null = null;
  private backpackModal: BackpackModal | null = null;
  private itemEffectText: Text | null = null;
  private static readonly ITEM_REDUCE_SEC = 10;

  constructor(opts: RoomPlaySceneOptions) {
    super();
    const { app, client, myRole, initialTurn, turnStartAt, rule, myCode, joinUrl, onBack, history, inventory } = opts;
    this.app = app;
    this.client = client;
    this.myRole = myRole;
    this.turn = initialTurn;
    this.turnStartAt = turnStartAt;
    this.rule = rule;
    this.inventory = inventory ?? {};
    const w = app.screen.width;
    const cx = w / 2;

    // 恢复历史记录（如果是重连）
    if (history && history.length > 0) {
      console.log(`[RoomPlayScene] restoring ${history.length} history records`);
      history.forEach((record) => {
        const line = `${record.guess} → ${record.result}`;
        if (record.role === myRole) {
          this.myHistory.push(line);
        } else {
          this.peerHistory.push(line);
        }
      });
    }

    // Update browser URL to joinUrl for easy sharing
    if (joinUrl && typeof window !== "undefined") {
      try {
        const url = new URL(joinUrl);
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch (e) {
        console.warn("Failed to update URL:", e);
      }
    }

    const backButton = new BackButton({
      x: 16,
      y: 16,
      onClick: () => {
        onBack();
      },
    });
    this.addChild(backButton);

    const toggleSize = 48;
    const musicToggle = new MusicToggle({
      x: w - 16 - toggleSize,
      y: 16,
    });
    this.addChild(musicToggle);

    // 背包按钮
    const totalItems = Object.values(this.inventory).reduce((sum, count) => sum + count, 0);
    this.backpackButton = new BackpackButton({
      x: w - 16 - toggleSize * 2 - 10,
      y: 16,
      onClick: () => this._showBackpack(),
    });
    this.backpackButton.updateCount(totalItems);
    this.addChild(this.backpackButton);

    this.turnText = new Text({
      text: this.turn === myRole ? "你的回合" : "对方回合",
      style: { fontFamily: "system-ui", fontSize: 18, fill: this.turn === myRole ? 0x00ffcc : 0xffaa44 },
    });
    this.turnText.anchor.set(0.5);
    this.turnText.x = cx - 50;
    this.turnText.y = 80;
    this.addChild(this.turnText);

    this.countdownText = new Text({
      text: String(TURN_SEC),
      style: { fontFamily: "system-ui", fontSize: 16, fill: 0xffaa44 },
    });
    this.countdownText.anchor.set(0.5);
    this.countdownText.x = cx + 50;
    this.countdownText.y = 80;
    this.addChild(this.countdownText);

    const secLabel = new Text({
      text: "秒",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x888888 },
    });
    secLabel.anchor.set(0, 0.5);
    secLabel.x = cx + 65;
    secLabel.y = 80;
    this.addChild(secLabel);

    this.guessInput = new GuessInput({
      slotSize: 50,
      keySize: 64,
      keyGap: 8,
      allowRepeat: rule === "position_only",
      onSubmit: (guess) => this._submitGuess(guess),
    });
    this.guessInput.x = cx;
    this.guessInput.y = 90;
    this.addChild(this.guessInput);

    this.resultText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0x88ff88 },
    });
    this.resultText.anchor.set(0.5, 0);
    this.resultText.x = cx;
    this.resultText.y = 90 + this.guessInput.totalHeight + 6;
    this.addChild(this.resultText);

    const historyY = 90 + this.guessInput.totalHeight + 28;
    const colGap = 20;
    this.myHistoryText = new Text({
      text: this.myHistory.length > 0
        ? "我的猜测：\n" + this.myHistory.join("\n")
        : "我的猜测：\n",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x00ccaa },
    });
    this.myHistoryText.anchor.set(0, 0);
    this.myHistoryText.x = colGap;
    this.myHistoryText.y = historyY;
    this.addChild(this.myHistoryText);
    // 显示我的密码
    const myCodeLabel = new Text({
      text: `我的密码：${myCode}`,
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x00ffcc, fontWeight: "bold" },
    });
    myCodeLabel.anchor.set(0, 0);
    myCodeLabel.x = w / 2 + colGap;
    myCodeLabel.y = historyY;
    this.addChild(myCodeLabel);

    this.peerHistoryText = new Text({
      text: this.peerHistory.length > 0
        ? "对方猜测：\n" + this.peerHistory.join("\n")
        : "对方猜测：\n",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0xffaa66 },
    });
    this.peerHistoryText.anchor.set(0, 0);
    this.peerHistoryText.x = w / 2 + colGap;
    this.peerHistoryText.y = historyY + 18;
    this.addChild(this.peerHistoryText);

    // 道具效果提示文字
    const h = app.screen.height;
    this.itemEffectText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 13, fill: 0xff6644, fontWeight: "bold" },
    });
    this.itemEffectText.anchor.set(0.5);
    this.itemEffectText.x = cx;
    this.itemEffectText.y = h - 50;
    this.addChild(this.itemEffectText);

    this.guessInput.setEnabled(this.turn === myRole);
    this._startCountdown();
    this.unsub = this.client.onMessage((msg) => this._onMsg(msg));
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    if (this.tickerId !== null) clearInterval(this.tickerId);
    if (this.gameOverTickerBound) this.app.ticker.remove(this.gameOverTickerBound);
    this.unsub?.();
    super.destroy(options);
  }

  private _showGameOverOverlay(won: boolean): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;
    const cy = h / 2;

    const overlay = new Container();
    overlay.eventMode = "static";

    const bg = new Graphics();
    if (won) {
      bg.roundRect(0, 0, w, h, 0).fill({ color: 0x0a1220, alpha: 0.92 });
      const glow = new Graphics();
      glow.circle(cx, cy, 180).fill({ color: 0x00ffcc, alpha: 0.08 });
      overlay.addChild(glow);
    } else {
      bg.roundRect(0, 0, w, h, 0).fill({ color: 0x0d0810, alpha: 0.94 });
      const vignette = new Graphics();
      vignette.circle(cx, cy, Math.max(w, h) * 0.8).fill({ color: 0x330011, alpha: 0.2 });
      overlay.addChild(vignette);
    }
    overlay.addChildAt(bg, 0);

    const title = new Text({
      text: won ? "你赢了！" : "你输了",
      style: {
        fontFamily: "system-ui",
        fontSize: 44,
        fontWeight: "bold",
        fill: won ? 0x00ffcc : 0xff4466,
      },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = cy - 30;
    title.scale.set(0);
    overlay.addChild(title);

    const sub = new Text({
      text: won ? "恭喜获胜" : "对方先猜中",
      style: { fontFamily: "system-ui", fontSize: 18, fill: won ? 0x88ffaa : 0xaa6688 },
    });
    sub.anchor.set(0.5);
    sub.x = cx;
    sub.y = cy + 35;
    sub.alpha = 0;
    overlay.addChild(sub);

    const particleCount = won ? 24 : 16;
    const colors = won ? [0x00ffcc, 0x00ff88, 0xffdd00, 0x88ffff] : [0x440022, 0x660033, 0xff2244, 0x332244];
    for (let i = 0; i < particleCount; i++) {
      const g = new Graphics();
      const r = won ? 4 + Math.random() * 6 : 3 + Math.random() * 5;
      const color = colors[Math.floor(Math.random() * colors.length)];
      g.circle(0, 0, r).fill({ color, alpha: won ? 0.9 : 0.7 });
      g.x = cx + (Math.random() - 0.5) * 40;
      g.y = cy + (Math.random() - 0.5) * 40;
      const angle = (i / particleCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = won ? 80 + Math.random() * 120 : 30 + Math.random() * 40;
      overlay.addChild(g);
      this.gameOverParticles.push({
        g,
        vx: Math.cos(angle) * speed,
        vy: (won ? Math.sin(angle) : 1) * speed,
        life: 0,
        maxLife: won ? 1200 + Math.random() * 400 : 1800 + Math.random() * 600,
      });
    }

    this.addChild(overlay);
    this.gameOverOverlay = overlay;
    this.gameOverStartTime = performance.now();

    const tickerFn = (ticker: { deltaMS: number }) => {
      const dtMs = ticker.deltaMS;
      const dtSec = dtMs / 1000;
      const elapsed = performance.now() - this.gameOverStartTime;

      let titleScale: number;
      if (elapsed < 200) titleScale = (elapsed / 200) * 1.25;
      else if (elapsed < 350) titleScale = 0.9 + (0.1 * (elapsed - 200)) / 150;
      else titleScale = 1 + Math.sin(elapsed * 0.004) * 0.06;
      title.scale.set(Math.min(1.15, titleScale));
      title.alpha = Math.min(1, elapsed / 120);
      if (elapsed > 150) sub.alpha = Math.min(1, (elapsed - 150) / 200);

      for (let i = this.gameOverParticles.length - 1; i >= 0; i--) {
        const p = this.gameOverParticles[i];
        p.g.x += p.vx * dtSec;
        p.g.y += p.vy * dtSec;
        p.life += dtMs;
        const t = p.life / p.maxLife;
        p.g.alpha = Math.max(0, 1 - t);
        p.g.scale.set(1 - t * 0.5);
        if (p.life >= p.maxLife) {
          overlay.removeChild(p.g);
          p.g.destroy();
          this.gameOverParticles.splice(i, 1);
        }
      }
    };
    this.gameOverTickerBound = tickerFn;
    this.app.ticker.add(tickerFn);
  }

  private _startCountdown(): void {
    if (this.tickerId !== null) clearInterval(this.tickerId);
    const tick = () => {
      if (this.gameOver) return;
      const elapsed = (Date.now() - this.turnStartAt) / 1000;
      const remaining = TURN_SEC - elapsed;
      const sec = Math.max(0, Math.ceil(remaining));
      this.countdownText.text = String(sec);
      if (sec <= 5) this.countdownText.style.fill = 0xff6644;
      if (remaining <= 0) {
        if (this.tickerId !== null) clearInterval(this.tickerId);
        this.tickerId = null;
        this.countdownText.text = "0";
        if (this.turn === this.myRole) {
          this.resultText.text = "时间到";
          this.resultText.style.fill = 0xff6644;
          this.guessInput.setEnabled(false);
          if (!this.timeoutReported) {
            this.timeoutReported = true;
            this.client.turnTimeout();
          }
        }
      }
    };
    tick();
    this.tickerId = setInterval(tick, 500);
  }

  private _applyTurnSwitch(nextTurn: RoomRole, turnStartAt: number): void {
    this.timeoutReported = false;
    this.turn = nextTurn;
    this.turnStartAt = turnStartAt;
    this.guessInput.clear();
    this.turnText.text = this.turn === this.myRole ? "你的回合" : "对方回合";
    this.turnText.style.fill = this.turn === this.myRole ? 0x00ffcc : 0xffaa44;
    this.resultText.text = "";
    this.guessInput.setEnabled(this.turn === this.myRole);
    this._startCountdown();

    // 更新背包禁用状态（只能在自己回合使用）
    if (this.backpackModal) {
      this.backpackModal.setDisabled(this.turn !== this.myRole);
    }
  }

  private _showBackpack(): void {
    if (this.backpackModal || this.gameOver) return;

    const items = inventoryToItemData(this.inventory);
    this.backpackModal = new BackpackModal({
      app: this.app,
      items,
      disabled: this.turn !== this.myRole,
      onUseItem: (itemId) => this._useItem(itemId),
      onClose: () => this._hideBackpack(),
    });
    this.addChild(this.backpackModal);
  }

  private _hideBackpack(): void {
    if (this.backpackModal) {
      this.removeChild(this.backpackModal);
      this.backpackModal.destroy();
      this.backpackModal = null;
    }
  }

  private _useItem(itemId: string): void {
    if (this.gameOver || this.turn !== this.myRole) return;

    const count = this.inventory[itemId] ?? 0;
    if (count <= 0) {
      this._showItemEffect("道具数量不足");
      return;
    }

    // 发送使用道具消息
    this.client.useItem(itemId);

    // 乐观更新本地库存
    this.inventory[itemId] = count - 1;

    // 更新背包按钮徽章
    const totalItems = Object.values(this.inventory).reduce((sum, c) => sum + c, 0);
    if (this.backpackButton) {
      this.backpackButton.updateCount(totalItems);
    }

    // 更新模态框中的道具卡片
    if (this.backpackModal) {
      this.backpackModal.updateItemCount(itemId, this.inventory[itemId]);
    }

    // 关闭背包
    this._hideBackpack();
  }

  private _onItemUsed(msg: any): void {
    const role = msg.role as RoomRole;
    const itemId = msg.itemId as string;
    const effectData = msg.effectData;

    if (role === this.myRole) {
      // 我方使用道具
      this._applyItemEffect(itemId, effectData, true);
    } else {
      // 对方使用道具
      this._applyItemEffect(itemId, effectData, false);
    }
  }

  private _applyItemEffect(itemId: string, effectData: any, isMyItem: boolean): void {
    const effect = effectData?.effect;

    switch (effect) {
      case 'reveal_one':
        if (!isMyItem && effectData?.position != null && effectData?.digit != null) {
          this._showItemEffect(`💡 对方揭示了一个位置：位置${effectData.position + 1}是${effectData.digit}`);
        } else if (isMyItem) {
          this._showItemEffect(`🔍 已揭示位置${effectData.position + 1}：${effectData.digit}`);
        }
        break;

      case 'eliminate_two':
        if (!isMyItem && effectData?.eliminated) {
          this._showItemEffect(`❌ 对方排除了数字：${effectData.eliminated.join(', ')}`);
        } else if (isMyItem) {
          this._showItemEffect(`❌ 已排除数字：${effectData.eliminated.join(', ')}`);
        }
        break;

      case 'hint':
        if (!isMyItem && effectData?.digits) {
          this._showItemEffect(`💡 对方获得了提示：${effectData.digits.join(', ')}`);
        } else if (isMyItem) {
          this._showItemEffect(`💡 提示：答案包含数字 ${effectData.digits.join(', ')}`);
        }
        break;

      case 'extra_time':
        if (effectData?.targetRole === this.myRole) {
          // 给自己加时间
          this.turnStartAt -= effectData.seconds * 1000;
          this._startCountdown();
          this._showItemEffect(`⏰ 时间+${effectData.seconds}秒`);
        } else if (isMyItem) {
          this._showItemEffect(`⏰ 已为自己增加${effectData.seconds}秒`);
        }
        break;

      case 'reduce_opponent_time':
        if (effectData?.targetRole === this.myRole) {
          // 对方减我的时间
          this.turnStartAt += Math.abs(effectData.seconds) * 1000;
          this._startCountdown();
          this._showItemEffect(`⏳ 对方使用了减时！-${Math.abs(effectData.seconds)}秒`);
        } else if (isMyItem) {
          this._showItemEffect(`⏳ 已减少对方${Math.abs(effectData.seconds)}秒`);
        }
        break;

      case 'limit_opponent_guesses':
        if (effectData?.targetRole === this.myRole) {
          this._showItemEffect(`🚫 对方限制了你的猜测次数！`);
        } else if (isMyItem) {
          this._showItemEffect(`🚫 已限制对方猜测次数`);
        }
        break;

      default:
        if (isMyItem) {
          this._showItemEffect(`✓ 已使用道具`);
        } else {
          this._showItemEffect(`对方使用了道具`);
        }
    }
  }

  private _onInventorySync(msg: any): void {
    const role = msg.role as RoomRole;
    const inventory = msg.inventory as { [itemId: string]: number };

    if (role === this.myRole) {
      // 同步服务器下发的库存
      this.inventory = inventory;

      // 更新背包按钮徽章
      const totalItems = Object.values(this.inventory).reduce((sum, c) => sum + c, 0);
      if (this.backpackButton) {
        this.backpackButton.updateCount(totalItems);
      }

      // 如果背包打开着，更新其中的道具卡片
      if (this.backpackModal) {
        Object.keys(inventory).forEach(itemId => {
          this.backpackModal?.updateItemCount(itemId, inventory[itemId]);
        });
      }
    }
  }

  private _showItemEffect(text: string): void {
    if (!this.itemEffectText) return;
    this.itemEffectText.text = text;
    this.itemEffectText.alpha = 1;
    // 3 秒后淡出
    let fadeTimer: ReturnType<typeof setInterval> | null = null;
    const startFade = setTimeout(() => {
      let alpha = 1;
      fadeTimer = setInterval(() => {
        alpha -= 0.05;
        if (alpha <= 0) {
          if (this.itemEffectText) {
            this.itemEffectText.alpha = 0;
            this.itemEffectText.text = "";
          }
          if (fadeTimer) clearInterval(fadeTimer);
        } else {
          if (this.itemEffectText) this.itemEffectText.alpha = alpha;
        }
      }, 50);
    }, 2000);
    // 避免内存泄漏（场景销毁时会清理 children）
    void startFade;
  }

  private _onMsg(msg: { type: string; role?: RoomRole; nextTurn?: RoomRole; turnStartAt?: number; guess?: string; result?: string; winner?: RoomRole; error?: string; itemId?: string; effectData?: any; inventory?: { [itemId: string]: number } }): void {
    if (msg.type === "item_used") {
      this._onItemUsed(msg);
      return;
    }
    if (msg.type === "inventory_sync") {
      this._onInventorySync(msg);
      return;
    }
    if (msg.type === "turn_switch") {
      if (msg.nextTurn != null) this._applyTurnSwitch(msg.nextTurn, msg.turnStartAt ?? Date.now());
      return;
    }
    if (msg.type === "guess_result") {
      const line = `${msg.guess} → ${msg.result}`;
      if (msg.role === this.myRole) {
        this.myHistory.push(line);
        this.myHistoryText.text = "我的猜测：\n" + this.myHistory.join("\n");
      } else {
        this.peerHistory.push(line);
        this.peerHistoryText.text = "对方猜测：\n" + this.peerHistory.join("\n");
      }
      this._applyTurnSwitch(msg.nextTurn!, msg.turnStartAt ?? Date.now());
    }
    if (msg.type === "game_over") {
      this.gameOver = true;
      const won = msg.winner === this.myRole;
      this.turnText.text = won ? "你赢了！" : "你输了";
      this.turnText.style.fill = won ? 0x00ff88 : 0xff6644;
      this.resultText.text = won ? "恭喜获胜" : "对方先猜中";
      this.guessInput.setEnabled(false);
      this._showGameOverOverlay(won);
    }
    if (msg.type === "error") {
      this.resultText.text = msg.error ?? "错误";
      this.resultText.style.fill = 0xff6644;
    }
  }

  private _submitGuess(guess: string): void {
    if (this.turn !== this.myRole || this.gameOver) return;
    this.client.guess(guess);
  }
}
