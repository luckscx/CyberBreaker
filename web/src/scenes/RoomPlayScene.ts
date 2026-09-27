import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { GuessInput } from "@/components/GuessInput";
import { GuessBoard, type GuessRecord } from "@/components/GuessBoard";
import { ResultBanner } from "@/components/ResultBanner";
import { SceneChrome } from "@/components/SceneChrome";
import { Segmented } from "@/components/Segmented";
import { BackpackButton } from "@/components/BackpackButton";
import { BackpackModal } from "@/components/BackpackModal";
import { RoomClient, type RoomRole, type RoomRule } from "@/room/client";
import { inventoryToItemData } from "@/data/pvpItems";
import { parseAbResult } from "@/logic/guess";
import { ITEM_TYPE_DIGITS } from "@/types/itemTypes";
import {
  computePlayGeometry,
  computePlayScreen,
  observeResize,
} from "@/ui/layout";
import { Color, Font, Size } from "@/ui/theme";

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

const TURN_SEC = 60;
/** 状态条高度（回合 / 倒计时 + 我的密码） */
const STATS_H = 46;
/** 分段控件高度 */
const SEG_H = 34;

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

const RULE_TITLE: Record<RoomRule, string> = {
  standard: "联机对战 · 标准",
  position_only: "联机对战 · 位置赛",
  guess_person: "联机对战 · 猜人名",
};

/**
 * 实时 1v1 对战。
 *
 * 呈现层改动（玩法逻辑与 WS 协议不变）：
 *   - 顶栏接入 SceneChrome，与其余页面统一；背包键挂在顶栏 extras 上
 *   - 双方历史从「两列 12px 纯文本」改为「分段切换 + 全宽 GuessBoard」：
 *     一块历史板吃满宽度，A/B 徽章才有位置显示清楚；分段标签带条数，
 *     一眼能看出双方各猜了几次
 *   - 历史数据结构化（{guess,a,b}），不再拼字符串
 *   - 结果反馈改 ResultBanner，不再与其它元素抢位置
 *   - 整页自下而上排布（computePlayScreen），键盘贴底，矮屏不溢出，支持旋转重建
 */
export class RoomPlayScene extends Container {
  private app: Application;
  private client: RoomClient;
  private myRole: RoomRole;
  private turn: RoomRole;
  private turnStartAt: number;
  private rule: RoomRule;
  private myCode = "";
  private inventory: { [itemId: string]: number } = {};

  // 分层：UI 层可整体重建，模态与结算层常驻其上
  private uiLayer: Container;
  private modalLayer: Container;
  private overlayLayer: Container;

  private chrome: SceneChrome | null = null;
  private guessInput: GuessInput | null = null;
  private board: GuessBoard | null = null;
  private result: ResultBanner | null = null;
  private segmented: Segmented | null = null;
  private turnText: Text | null = null;
  private countdownText: Text | null = null;
  private myCodeText: Text | null = null;
  private itemEffectText: Text | null = null;
  private backpackButton: BackpackButton | null = null;
  private backpackModal: BackpackModal | null = null;

  private unsub: (() => void) | null = null;
  /** 结构化历史：我的 / 对方的 */
  private myHistory: GuessRecord[] = [];
  private peerHistory: GuessRecord[] = [];
  /** 当前分段视图 0=我方 1=对方 */
  private viewIndex = 0;

  private tickerId: ReturnType<typeof setInterval> | null = null;
  private timeoutReported = false;
  private gameOver = false;
  private gameOverOverlay: Container | null = null;
  private gameOverStartTime = 0;
  private gameOverParticles: Particle[] = [];
  private gameOverTickerBound: ((ticker: { deltaMS: number }) => void) | null = null;
  private stopResize: (() => void) | null = null;

  constructor(private opts: RoomPlaySceneOptions) {
    super();
    const { app, client, myRole, initialTurn, turnStartAt, rule, myCode, joinUrl, history, inventory } = opts;
    this.app = app;
    this.client = client;
    this.myRole = myRole;
    this.turn = initialTurn;
    this.turnStartAt = turnStartAt;
    this.rule = rule;
    this.inventory = inventory ?? {};
    this.myCode = myCode;

    // 恢复历史记录（重连场景）。解析失败的条目直接跳过，避免渲染出假结果。
    if (history && history.length > 0) {
      history.forEach((record) => {
        const parsed = parseAbResult(record.result);
        if (!parsed) return;
        const rec: GuessRecord = { guess: record.guess, a: parsed.a, b: parsed.b };
        if (record.role === myRole) this.myHistory.push(rec);
        else this.peerHistory.push(rec);
      });
    }

    if (joinUrl && typeof window !== "undefined") {
      try {
        const url = new URL(joinUrl);
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch (e) {
        console.warn("Failed to update URL:", e);
      }
    }

    this.uiLayer = new Container();
    this.modalLayer = new Container();
    this.overlayLayer = new Container();
    this.addChild(this.uiLayer, this.modalLayer, this.overlayLayer);

    this._buildUI();
    this._startCountdown();
    this.unsub = this.client.onMessage((msg) => this._onMsg(msg));
    this.stopResize = observeResize(() => this._relayout());
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    if (this.tickerId !== null) clearInterval(this.tickerId);
    if (this.gameOverTickerBound) this.app.ticker.remove(this.gameOverTickerBound);
    this.stopResize?.();
    this.stopResize = null;
    this.unsub?.();
    super.destroy(options);
  }

  // ════════════════════════════════════════
  //  构建
  // ════════════════════════════════════════

  private _buildUI(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    this.chrome = new SceneChrome({
      width: w,
      height: h,
      onBack: () => this.opts.onBack(),
      title: RULE_TITLE[this.rule] ?? "联机对战",
      subtitle: this.rule === "position_only" ? "数字可重复 · 只反馈位置正确个数" : "4 位不重复 · A 位置对 / B 数字对",
      extras: ({ right, y, size }) => this._buildBackpackButton(right, y, size),
    });
    this.uiLayer.addChild(this.chrome);

    const geometry = computePlayGeometry(w, ITEM_TYPE_DIGITS);
    const layout = computePlayScreen({
      chrome: this.chrome,
      geometry,
      showSlots: true,
      statsH: STATS_H,
      topExtraH: SEG_H + 8,
    });

    this._buildStats(layout.stats.y);

    // 道具效果提示（恒定占位，避免出现时把下面的元素挤下去）
    this.itemEffectText = new Text({
      text: "",
      style: {
        fontFamily: Font.sans,
        fontSize: Size.caption,
        fill: 0xffa94d,
        fontWeight: "600",
        align: "center",
        wordWrap: true,
        wordWrapWidth: this.chrome.contentWidth,
      },
    });
    this.itemEffectText.anchor.set(0.5, 0.5);
    this.itemEffectText.x = layout.centerX;
    this.itemEffectText.y = layout.stats.y + STATS_H - 10;
    this.uiLayer.addChild(this.itemEffectText);

    // 分段控件：我方 / 对方（标签带条数）
    this.segmented = new Segmented({
      width: layout.board.w,
      height: SEG_H,
      options: this._segmentLabels(),
      active: this.viewIndex,
      onChange: (i) => {
        this.viewIndex = i;
        this._syncBoard();
      },
    });
    this.segmented.x = layout.board.x;
    this.segmented.y = layout.stats.y + STATS_H + 8;
    this.uiLayer.addChild(this.segmented);

    this.board = new GuessBoard({
      width: layout.board.w,
      height: layout.board.h,
      title: this.viewIndex === 0 ? "我方猜测" : "对方猜测",
      emptyText:
        this.viewIndex === 0
          ? "你还没有猜过\n轮到你时用下方键盘输入"
          : "对方还没有猜过",
    });
    this.board.x = layout.board.x;
    this.board.y = layout.board.y;
    this.uiLayer.addChild(this.board);
    this._syncBoard();

    this.result = new ResultBanner({
      width: layout.board.w,
      idleText: this.turn === this.myRole ? "你的回合 · 输入 4 位后确认" : "等待对方猜测…",
    });
    this.result.x = layout.board.x;
    this.result.y = layout.result.y;
    this.uiLayer.addChild(this.result);

    this.guessInput = new GuessInput({
      screenWidth: w,
      itemType: ITEM_TYPE_DIGITS,
      allowRepeat: this.rule === "position_only",
      onSubmit: (guess) => this._submitGuess(guess),
    });
    this.guessInput.x = layout.centerX;
    this.guessInput.y = layout.inputTop;
    this.guessInput.setEnabled(this.turn === this.myRole && !this.gameOver);
    this.uiLayer.addChild(this.guessInput);
  }

  private _buildBackpackButton(right: number, y: number, size: number): Container {
    const totalItems = Object.values(this.inventory).reduce((sum, c) => sum + c, 0);
    this.backpackButton = new BackpackButton({
      x: right - size,
      y,
      size,
      onClick: () => this._showBackpack(),
    });
    this.backpackButton.updateCount(totalItems);
    return this.backpackButton;
  }

  private _buildStats(y: number): void {
    const left = this.chrome!.contentLeft;
    const right = this.chrome!.contentRight;

    const mine = this.turn === this.myRole;
    this.turnText = new Text({
      text: mine ? "● 你的回合" : "○ 对方回合",
      style: {
        fontFamily: Font.sans,
        fontSize: Size.bodySm + 1,
        fill: mine ? Color.primary : Color.warning,
        fontWeight: "bold",
      },
    });
    this.turnText.anchor.set(0, 0.5);
    this.turnText.position.set(left, y + 13);
    this.uiLayer.addChild(this.turnText);

    this.countdownText = new Text({
      text: String(TURN_SEC),
      style: {
        fontFamily: Font.mono,
        fontSize: Size.body + 3,
        fill: Color.warning,
        fontWeight: "bold",
      },
    });
    this.countdownText.anchor.set(1, 0.5);
    this.countdownText.position.set(right, y + 13);
    this.uiLayer.addChild(this.countdownText);

    // 我的密码：对手正在猜它，必须常驻可见
    this.myCodeText = new Text({
      text: `我的密码 ${this.myCode || "----"}`,
      style: {
        fontFamily: Font.mono,
        fontSize: Size.caption,
        fill: Color.textSub,
      },
    });
    this.myCodeText.anchor.set(0, 0.5);
    this.myCodeText.position.set(left, y + 34);
    this.uiLayer.addChild(this.myCodeText);
  }

  private _segmentLabels(): string[] {
    return [`我方 ${this.myHistory.length}`, `对方 ${this.peerHistory.length}`];
  }

  /** 把当前分段的记录推给历史板 */
  private _syncBoard(): void {
    if (!this.board || !this.segmented) return;
    const mine = this.viewIndex === 0;
    this.board.setTitle(mine ? "我方猜测" : "对方猜测");
    this.board.setRecords(mine ? this.myHistory : this.peerHistory);
    // 更新分段标签上的条数
    const labels = this._segmentLabels();
    labels.forEach((l, i) => this.segmented!.setLabel(i, l));
  }

  /** 尺寸变化后重建 UI 层（历史与回合状态都在实例字段里，不会丢） */
  private _relayout(): void {
    const wasOpen = !!this.backpackModal;
    this.backpackModal = null;
    this.modalLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.uiLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._buildUI();
    this._refreshCountdownFill();
    if (this.gameOver) this.guessInput?.setEnabled(false);
    if (wasOpen) this._showBackpack();
  }

  private _refreshCountdownFill(): void {
    if (!this.countdownText) return;
    const remaining = TURN_SEC - (Date.now() - this.turnStartAt) / 1000;
    this.countdownText.style.fill = remaining <= 5 ? Color.danger : Color.warning;
  }

  // ════════════════════════════════════════
  //  结算层
  // ════════════════════════════════════════

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
        fontFamily: Font.sans,
        fontSize: 44,
        fontWeight: "bold",
        fill: won ? Color.primary : 0xff4466,
      },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = cy - 30;
    title.scale.set(0);
    overlay.addChild(title);

    const sub = new Text({
      text: won ? "恭喜获胜" : "对方先猜中",
      style: { fontFamily: Font.sans, fontSize: Size.body + 3, fill: won ? 0x88ffaa : 0xaa6688 },
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

    this.overlayLayer.addChild(overlay);
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

  // ════════════════════════════════════════
  //  回合 / 倒计时
  // ════════════════════════════════════════

  private _startCountdown(): void {
    if (this.tickerId !== null) clearInterval(this.tickerId);
    const tick = () => {
      if (this.gameOver) return;
      const elapsed = (Date.now() - this.turnStartAt) / 1000;
      const remaining = TURN_SEC - elapsed;
      const sec = Math.max(0, Math.ceil(remaining));
      if (this.countdownText) {
        this.countdownText.text = String(sec);
        if (sec <= 5) this.countdownText.style.fill = Color.danger;
      }
      if (remaining <= 0) {
        if (this.tickerId !== null) clearInterval(this.tickerId);
        this.tickerId = null;
        if (this.countdownText) this.countdownText.text = "0";
        if (this.turn === this.myRole) {
          this.result?.showError("时间到");
          this.guessInput?.setEnabled(false);
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
    this.guessInput?.clear();

    if (this.turnText) {
      const mine = this.turn === this.myRole;
      this.turnText.text = mine ? "● 你的回合" : "○ 对方回合";
      this.turnText.style.fill = mine ? Color.primary : Color.warning;
    }
    this.result?.setIdleText(
      this.turn === this.myRole ? "你的回合 · 输入 4 位后确认" : "等待对方猜测…"
    );
    this.result?.clear();
    this.guessInput?.setEnabled(this.turn === this.myRole && !this.gameOver);
    this._startCountdown();

    if (this.backpackModal) {
      this.backpackModal.setDisabled(this.turn !== this.myRole);
    }
  }

  // ════════════════════════════════════════
  //  道具
  // ════════════════════════════════════════

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
    this.modalLayer.addChild(this.backpackModal);
  }

  private _hideBackpack(): void {
    if (this.backpackModal) {
      this.modalLayer.removeChild(this.backpackModal);
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

    this.client.useItem(itemId);
    this.inventory[itemId] = count - 1;

    const totalItems = Object.values(this.inventory).reduce((sum, c) => sum + c, 0);
    this.backpackButton?.updateCount(totalItems);

    if (this.backpackModal) {
      this.backpackModal.updateItemCount(itemId, this.inventory[itemId]);
    }
    this._hideBackpack();
  }

  private _onItemUsed(msg: any): void {
    const role = msg.role as RoomRole;
    const itemId = msg.itemId as string;
    const effectData = msg.effectData;
    this._applyItemEffect(itemId, effectData, role === this.myRole);
  }

  private _applyItemEffect(_itemId: string, effectData: any, isMyItem: boolean): void {
    const effect = effectData?.effect;

    switch (effect) {
      case "reveal_one":
        if (!isMyItem && effectData?.position != null && effectData?.digit != null) {
          this._showItemEffect(`💡 对方揭示了一个位置：位置${effectData.position + 1}是${effectData.digit}`);
        } else if (isMyItem) {
          this._showItemEffect(`🔍 已揭示位置${effectData.position + 1}：${effectData.digit}`);
        }
        break;

      case "eliminate_two":
        if (!isMyItem && effectData?.eliminated) {
          this._showItemEffect(`❌ 对方排除了数字：${effectData.eliminated.join(", ")}`);
        } else if (isMyItem) {
          this._showItemEffect(`❌ 已排除数字：${effectData.eliminated.join(", ")}`);
        }
        break;

      case "hint":
        if (!isMyItem && effectData?.digits) {
          this._showItemEffect(`💡 对方获得了提示：${effectData.digits.join(", ")}`);
        } else if (isMyItem) {
          this._showItemEffect(`💡 提示：答案包含数字 ${effectData.digits.join(", ")}`);
        }
        break;

      case "extra_time":
        if (effectData?.targetRole === this.myRole) {
          this.turnStartAt -= effectData.seconds * 1000;
          this._startCountdown();
          this._showItemEffect(`⏰ 时间+${effectData.seconds}秒`);
        } else if (isMyItem) {
          this._showItemEffect(`⏰ 已为自己增加${effectData.seconds}秒`);
        }
        break;

      case "reduce_opponent_time":
        if (effectData?.targetRole === this.myRole) {
          this.turnStartAt += Math.abs(effectData.seconds) * 1000;
          this._startCountdown();
          this._showItemEffect(`⏳ 对方使用了减时！-${Math.abs(effectData.seconds)}秒`);
        } else if (isMyItem) {
          this._showItemEffect(`⏳ 已减少对方${Math.abs(effectData.seconds)}秒`);
        }
        break;

      default:
        break;
    }
  }

  private _onInventorySync(msg: any): void {
    const inv = msg.inventory as { [itemId: string]: number } | undefined;
    if (!inv) return;
    this.inventory = inv;
    const totalItems = Object.values(this.inventory).reduce((sum, c) => sum + c, 0);
    this.backpackButton?.updateCount(totalItems);
  }

  private _showItemEffect(text: string): void {
    if (!this.itemEffectText) return;
    this.itemEffectText.text = text;
    const start = Date.now();
    const dur = 3000;
    const step = () => {
      if (this.destroyed || !this.itemEffectText) return;
      const t = (Date.now() - start) / dur;
      if (t >= 1) {
        this.itemEffectText.text = "";
        return;
      }
      // 最后 0.6s 淡出
      this.itemEffectText.alpha = t > 0.8 ? (1 - t) / 0.2 : 1;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ════════════════════════════════════════
  //  消息
  // ════════════════════════════════════════

  private _onMsg(msg: any): void {
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
      const parsed = parseAbResult(msg.result);
      if (parsed) {
        const rec: GuessRecord = { guess: msg.guess, a: parsed.a, b: parsed.b };
        if (msg.role === this.myRole) this.myHistory.push(rec);
        else this.peerHistory.push(rec);
        this._syncBoard();
        // 自己的猜测结果也同步到结果条，立刻能看清
        if (msg.role === this.myRole) this.result?.show(msg.guess, parsed.a, parsed.b);
      } else {
        console.warn("[RoomPlayScene] 无法解析服务端结果串:", msg.result);
      }
      this._applyTurnSwitch(msg.nextTurn!, msg.turnStartAt ?? Date.now());
    }
    if (msg.type === "game_over") {
      this.gameOver = true;
      const won = msg.winner === this.myRole;
      if (this.turnText) {
        this.turnText.text = won ? "● 你赢了" : "○ 你输了";
        this.turnText.style.fill = won ? Color.success : Color.danger;
      }
      this.guessInput?.setEnabled(false);
      this._showGameOverOverlay(won);
    }
    if (msg.type === "error") {
      this.result?.showError(msg.error ?? "错误");
    }
  }

  private _submitGuess(guess: string): void {
    if (this.turn !== this.myRole || this.gameOver) return;
    this.client.guess(guess);
  }
}
