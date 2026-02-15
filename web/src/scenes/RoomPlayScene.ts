import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { KeyButton } from "@/components/KeyButton";
import { MusicToggle } from "@/components/MusicToggle";
import { BackButton } from "@/components/BackButton";
import { RoomClient, type RoomRole, type RoomRule } from "@/room/client";
import { isValidGuessForRule } from "@/logic/guess";

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

const SLOT_SIZE = 50;
const SLOT_GAP = 8;
const KEY_SIZE = 64;
const KEY_GAP = 8;
const KEYPAD_COLS = 3;
const KEYPAD_ROWS = 4;
const KEYPAD_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const RADIUS = 8;
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
  private slotContainer: Container;
  private currentGuess = "";
  private digitButtons: KeyButton[] = [];
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
  private myItemUsed = false;
  private peerItemUsed = false;
  private itemBtn: Button | null = null;
  private itemEffectText: Text | null = null;
  private static readonly ITEM_REDUCE_SEC = 20;

  constructor(opts: RoomPlaySceneOptions) {
    super();
    const { app, client, myRole, initialTurn, turnStartAt, rule, myCode, joinUrl, onBack, history } = opts;
    this.app = app;
    this.client = client;
    this.myRole = myRole;
    this.turn = initialTurn;
    this.turnStartAt = turnStartAt;
    this.rule = rule;
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
      x: 16 + 24,
      y: 16 + 24,
      onClick: () => {
        onBack();
      },
    });
    this.addChild(backButton);

    const margin = 16;
    const toggleSize = 48;
    const musicToggle = new MusicToggle({
      x: w - margin - toggleSize,
      y: margin,
    });
    this.addChild(musicToggle);

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

    this.slotContainer = this._buildSlots();
    this.slotContainer.x = cx - (4 * SLOT_SIZE + 3 * SLOT_GAP) / 2 + SLOT_SIZE / 2 + SLOT_GAP / 2;
    this.slotContainer.y = 115;
    this.addChild(this.slotContainer);

    const keypadY = 180;
    const keypadW = KEYPAD_COLS * KEY_SIZE + (KEYPAD_COLS - 1) * KEY_GAP;
    KEYPAD_DIGITS.forEach((digit, i) => {
      const row = Math.floor(i / KEYPAD_COLS);
      const col = i % KEYPAD_COLS;
      const btn = new KeyButton({
        label: String(digit),
        width: KEY_SIZE,
        height: KEY_SIZE,
        fontSize: 22,
        onClick: () => {
          this._addDigit(digit);
        },
      });
      btn.x = cx - keypadW / 2 + KEY_SIZE / 2 + col * (KEY_SIZE + KEY_GAP);
      btn.y = keypadY + row * (KEY_SIZE + KEY_GAP);
      this.addChild(btn);
      this.digitButtons.push(btn);
    });

    const backspaceBtn = new Button({
      label: "⌫ 退格",
      width: 90,
      fontSize: 14,
      onClick: () => {
        this._backspace();
      },
    });
    backspaceBtn.x = cx - 50;
    backspaceBtn.y = keypadY + KEYPAD_ROWS * (KEY_SIZE + KEY_GAP) + 10;
    this.addChild(backspaceBtn);

    const confirmBtn = new Button({
      label: "✓ 确认",
      width: 90,
      fontSize: 14,
      onClick: () => {
        this._submitGuess();
      },
    });
    confirmBtn.x = cx + 50;
    confirmBtn.y = keypadY + KEYPAD_ROWS * (KEY_SIZE + KEY_GAP) + 10;
    this.addChild(confirmBtn);

    this.resultText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0x88ff88 },
    });
    this.resultText.anchor.set(0.5, 0);
    this.resultText.x = cx;
    this.resultText.y = keypadY + KEYPAD_ROWS * (KEY_SIZE + KEY_GAP) + 38;
    this.addChild(this.resultText);

    const historyY = keypadY + KEYPAD_ROWS * (KEY_SIZE + KEY_GAP) + 58;
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

    // 道具按钮 & 说明：放在页面最底部
    const h = app.screen.height;

    const itemHint = new Text({
      text: "对手回合 -20秒",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x668899 },
    });
    itemHint.anchor.set(0.5);
    itemHint.x = cx;
    itemHint.y = h - 58;
    this.addChild(itemHint);

    this.itemBtn = new Button({
      label: "⚡ 减时道具（1次）",
      width: 140,
      fontSize: 12,
      onClick: () => {
        this._useItem();
      },
    });
    this.itemBtn.x = cx;
    this.itemBtn.y = h - 32;
    this.addChild(this.itemBtn);

    this.itemEffectText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 13, fill: 0xff6644, fontWeight: "bold" },
    });
    this.itemEffectText.anchor.set(0.5);
    this.itemEffectText.x = cx;
    this.itemEffectText.y = h - 75;
    this.addChild(this.itemEffectText);

    this._refreshSlots();
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
          this._setInputEnabled(false);
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
    this.currentGuess = "";
    this._refreshSlots();
    this.turnText.text = this.turn === this.myRole ? "你的回合" : "对方回合";
    this.turnText.style.fill = this.turn === this.myRole ? 0x00ffcc : 0xffaa44;
    this.resultText.text = "";
    this._setInputEnabled(this.turn === this.myRole);
    this._startCountdown();
  }

  private _useItem(): void {
    if (this.myItemUsed || this.gameOver) return;
    this.client.useItem();
  }

  private _onItemUsed(byRole: RoomRole): void {
    if (byRole === this.myRole) {
      // 我方使用：标记已用，禁用按钮
      this.myItemUsed = true;
      if (this.itemBtn) {
        this.itemBtn.setLabel("已使用");
        this.itemBtn.eventMode = "none";
        this.itemBtn.alpha = 0.4;
      }
    } else {
      // 对方使用：标记对方已用
      this.peerItemUsed = true;
    }

    if (byRole !== this.myRole) {
      // 对方对我使用 → 我当前回合立即减 20 秒（把 turnStartAt 往前推）
      this.turnStartAt -= RoomPlayScene.ITEM_REDUCE_SEC * 1000;
      this._startCountdown(); // 立刻刷新倒计时
      this._showItemEffect("对方使用了⚡减时！-20s");
    } else {
      // 我对对方使用（对方的倒计时由对方客户端处理，我这边也前推保持同步）
      this.turnStartAt -= RoomPlayScene.ITEM_REDUCE_SEC * 1000;
      this._startCountdown();
      this._showItemEffect("⚡已对对方使用减时！");
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

  private _onMsg(msg: { type: string; role?: RoomRole; nextTurn?: RoomRole; turnStartAt?: number; guess?: string; result?: string; winner?: RoomRole; error?: string }): void {
    if (msg.type === "item_used") {
      if (msg.role) this._onItemUsed(msg.role);
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
      this._setInputEnabled(false);
      this._showGameOverOverlay(won);
    }
    if (msg.type === "error") {
      this.resultText.text = msg.error ?? "错误";
      this.resultText.style.fill = 0xff6644;
    }
  }

  private _buildSlots(): Container {
    const c = new Container();
    for (let i = 0; i < 4; i++) {
      const box = new Graphics();
      box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).fill({ color: 0x1a2332 });
      box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).stroke({ width: 1, color: 0x334455 });
      box.x = i * (SLOT_SIZE + SLOT_GAP);
      c.addChild(box);
      const text = new Text({
        text: "?",
        style: { fontFamily: "system-ui", fontSize: 20, fill: 0x00ffcc },
      });
      text.anchor.set(0.5);
      text.x = i * (SLOT_SIZE + SLOT_GAP);
      text.name = `slot-${i}`;
      c.addChild(text);
    }
    return c;
  }

  private _refreshSlots(): void {
    const digits = this.currentGuess.split("");
    for (let i = 0; i < 4; i++) {
      const t = this.slotContainer.getChildByName(`slot-${i}`) as Text;
      if (t) t.text = digits[i] ?? "?";
    }
    this.digitButtons.forEach((btn, i) => {
      if (this.rule === "position_only") btn.visible = true;
      else btn.visible = !this.currentGuess.includes(String(KEYPAD_DIGITS[i]));
    });
  }

  private _setInputEnabled(enabled: boolean): void {
    this.digitButtons.forEach((b) => { b.eventMode = enabled ? "static" : "none"; });
    this.slotContainer.visible = enabled;
  }

  private _addDigit(d: number): void {
    if (this.turn !== this.myRole) return;
    if (this.currentGuess.length >= 4) return;
    if (this.rule === "standard" && this.currentGuess.includes(String(d))) return;
    this.currentGuess += d;
    this.resultText.text = "";
    this._refreshSlots();
  }

  private _backspace(): void {
    if (this.turn !== this.myRole) return;
    this.currentGuess = this.currentGuess.slice(0, -1);
    this.resultText.text = "";
    this._refreshSlots();
  }

  private _submitGuess(): void {
    if (this.turn !== this.myRole || !isValidGuessForRule(this.currentGuess, this.rule)) return;
    this.client.guess(this.currentGuess);
    this.currentGuess = "";
    this._refreshSlots();
  }
}
