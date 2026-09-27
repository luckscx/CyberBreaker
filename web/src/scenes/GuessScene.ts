import type { Application } from "pixi.js";
import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { GuessInput } from "@/components/GuessInput";
import { GuessBoard, type GuessRecord } from "@/components/GuessBoard";
import { ResultBanner } from "@/components/ResultBanner";
import { SceneChrome } from "@/components/SceneChrome";
import { Button } from "@/components/Button";
import { evaluate, generateSecretFromItems, isValidGuessForItems } from "@/logic/guess";
import type { ItemType } from "@/types/itemTypes";
import { DEFAULT_ITEM_TYPE } from "@/types/itemTypes";
import { computePlayGeometry, computePlayScreen, observeResize } from "@/ui/layout";
import { Color, Font, Radius, Size } from "@/ui/theme";

export interface GuessSceneOptions {
  onBack: () => void;
  /** 物品类型（数字、水果等），默认为数字 */
  itemType?: ItemType;
}

/**
 * 教学模式（无限时自由练习）。
 *
 * 页面分区（自上而下，键盘贴底）：
 *   顶栏 / 历史板（自适应、可滚动） / 结果条带 / 输入槽 / 键盘
 * 结果反馈只占用自己的条带，永远不会盖住键盘 —— 修掉旧版
 * 「结果卡片浮在键盘上 2.2 秒且点击穿透」的交互问题。
 */
export class GuessScene extends Container {
  private itemType: ItemType;
  private secret: string;
  private history: GuessRecord[] = [];
  private gameEnded = false;

  private content: Container;
  private chrome!: SceneChrome;
  private board!: GuessBoard;
  private result!: ResultBanner;
  private input!: GuessInput;
  private winOverlay: Container | null = null;
  private stopResize: (() => void) | null = null;

  constructor(private app: Application, private opts: GuessSceneOptions) {
    super();
    this.itemType = opts.itemType ?? DEFAULT_ITEM_TYPE;
    this.secret = generateSecretFromItems(
      this.itemType.items,
      4,
      this.itemType.allowRepeat ?? false
    );

    this.content = new Container();
    this.addChild(this.content);

    this._build();
    this.app.ticker.add(this._animate, this);

    // 手机旋转 / 地址栏收起后重建布局，避免沿用旧坐标导致内容溢出
    this.stopResize = observeResize(() => this._rebuild());
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.stopResize?.();
    this.stopResize = null;
    this.app.ticker.remove(this._animate, this);
    super.destroy(options);
  }

  private _animate = (): void => {
    this.chrome?.animate();
  };

  /** 重建整页（用于尺寸变化）；游戏状态保存在实例字段中，不会丢失 */
  private _rebuild(): void {
    const snapshot = this.input?.guess ?? "";
    const ended = this.gameEnded;
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.winOverlay = null;
    this.gameEnded = false;
    this._build();
    if (snapshot) this.input.setGuess(snapshot);
    if (ended) {
      this.gameEnded = true;
      this.input.setEnabled(false);
      if (this.history.length > 0) {
        const last = this.history[this.history.length - 1];
        this.result.show(last.guess, last.a, last.b);
      }
      this._showWinOverlay();
    }
  }

  private _build(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    this.chrome = new SceneChrome({
      width: w,
      height: h,
      onBack: () => this.opts.onBack(),
      title: `教学模式 · ${this.itemType.name}`,
      subtitle: this.itemType.rules,
      particleCount: 25,
    });
    this.content.addChild(this.chrome);

    const geometry = computePlayGeometry(w, this.itemType);
    const layout = computePlayScreen({ chrome: this.chrome, geometry, showSlots: true });

    this.board = new GuessBoard({
      width: layout.board.w,
      height: layout.board.h,
      emptyText: "还没有猜测记录\n按下方键盘输入 4 位后点「确认」",
    });
    this.board.x = layout.board.x;
    this.board.y = layout.board.y;
    this.board.setRecords(this.history);
    this.content.addChild(this.board);

    this.result = new ResultBanner({
      width: layout.board.w,
      idleText: "A 位置对 · B 数字对",
    });
    this.result.x = layout.board.x;
    this.result.y = layout.result.y;
    this.content.addChild(this.result);

    this.input = new GuessInput({
      screenWidth: w,
      itemType: this.itemType,
      onSubmit: (guess) => this._confirm(guess),
    });
    this.input.x = layout.centerX;
    this.input.y = layout.inputTop;
    this.content.addChild(this.input);

    if (this.gameEnded) this.input.setEnabled(false);
    if (this.winOverlay) this._showWinOverlay();
  }

  /** 重新开一局：换一个密码，清空记录与结算层 */
  private _restart(): void {
    this.secret = generateSecretFromItems(
      this.itemType.items,
      4,
      this.itemType.allowRepeat ?? false
    );
    this.history = [];
    this.gameEnded = false;
    this.winOverlay = null;
    this.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._build();
  }

  // ──────────────────────────── 提交逻辑 ────────────────────────────

  private _confirm(guess: string): void {
    if (this.gameEnded) return;
    if (!isValidGuessForItems(guess, this.itemType.items, 4, this.itemType.allowRepeat ?? false)) {
      this.result.showError("请输入 4 个不重复的物品");
      return;
    }

    const { a, b } = evaluate(this.secret, guess);
    this.history.push({ guess, a, b });
    this.board.setRecords(this.history);
    this.result.show(guess, a, b);

    if (a === 4) {
      this.gameEnded = true;
      this.input.setEnabled(false);
      this._showWinOverlay();
    }
  }

  // ──────────────────────────── 通关覆盖层 ────────────────────────────

  /**
   * 旧版猜中后只是把键盘置灰、卡片上补一行字，玩家既拿不到出口也看不到成绩。
   * 这里补一个明确的结算层：成绩 + 「再来一局 / 返回」。
   */
  private _showWinOverlay(): void {
    if (this.winOverlay) {
      this.content.removeChild(this.winOverlay);
      this.winOverlay.destroy({ children: true });
    }

    const w = this.app.screen.width;
    const h = this.app.screen.height;

    const overlay = new Container();
    // 拦截点击，避免误触到底层键盘
    overlay.eventMode = "static";
    overlay.hitArea = new Rectangle(0, 0, w, h);
    const scrim = new Graphics();
    scrim.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.72 });
    overlay.addChild(scrim);

    const cardW = Math.min(300, w - 40);
    const cardH = 232;
    const card = new Container();
    card.x = w / 2;
    card.y = h / 2;

    const bg = new Graphics();
    bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, Radius.xl).fill({
      color: Color.bgElevated,
      alpha: 0.98,
    });
    bg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, Radius.xl).stroke({
      width: 1.6,
      color: Color.success,
      alpha: 0.85,
    });
    card.addChild(bg);

    const title = new Text({
      text: "🎉 破译成功",
      style: {
        fontFamily: Font.sans,
        fontSize: Size.title,
        fill: Color.success,
        fontWeight: "bold",
      },
    });
    title.anchor.set(0.5);
    title.y = -cardH / 2 + 46;
    card.addChild(title);

    const secretText = new Text({
      text: `密码 ${this.secret}`,
      style: { fontFamily: Font.mono, fontSize: Size.body, fill: Color.textSub },
    });
    secretText.anchor.set(0.5);
    secretText.y = -cardH / 2 + 86;
    card.addChild(secretText);

    const scoreText = new Text({
      text: `共猜 ${this.history.length} 次`,
      style: { fontFamily: Font.sans, fontSize: Size.body, fill: Color.primary },
    });
    scoreText.anchor.set(0.5);
    scoreText.y = -cardH / 2 + 112;
    card.addChild(scoreText);

    const againBtn = new Button({
      label: "🎲 再来一局",
      width: cardW - 60,
      height: 48,
      fontSize: 16,
      onClick: () => this._restart(),
    });
    againBtn.x = 0;
    againBtn.y = -cardH / 2 + 156;
    card.addChild(againBtn);

    const backBtn = new Button({
      label: "返回",
      width: cardW - 60,
      height: 44,
      fontSize: 15,
      fillColor: Color.bgPanel,
      onClick: () => this.opts.onBack(),
    });
    backBtn.x = 0;
    backBtn.y = -cardH / 2 + 206;
    card.addChild(backBtn);

    overlay.addChild(card);
    this.winOverlay = overlay;
    this.content.addChild(overlay);
  }
}
