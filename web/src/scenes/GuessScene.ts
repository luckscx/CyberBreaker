import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { GuessInput } from "@/components/GuessInput";
import { Background } from "@/components/Background";
import { MusicToggle } from "@/components/MusicToggle";
import { BackButton } from "@/components/BackButton";
import { evaluate, generateSecretFromItems, isValidGuessForItems } from "@/logic/guess";
import type { ItemType } from "@/types/itemTypes";
import { DEFAULT_ITEM_TYPE } from "@/types/itemTypes";

export interface GuessSceneOptions {
  onBack: () => void;
  /** 物品类型（数字、水果等），默认为数字 */
  itemType?: ItemType;
}

interface HistoryItem {
  guess: string;
  a: number;
  b: number;
}

export class GuessScene extends Container {
  private itemType: ItemType;
  private secret: string;
  private history: HistoryItem[] = [];
  private guessInput: GuessInput;
  private gameEnded = false;
  private bg: Background;
  private inputStartY = 84;

  // ── 结果展示 ──
  private resultCard: Container;
  private resultCardBg!: Graphics;
  private resultDigitBoxes!: Graphics[];
  private resultDigits!: Text[];
  private resultAbText!: Text;
  private _resultAnimRaf: number = 0;
  private _resultHideTimer: ReturnType<typeof setTimeout> | null = null;

  // ── 历史记录 ──
  private historyContainer: Container;
  private historyEntries: Container[] = [];

  constructor(private app: Application, opts: GuessSceneOptions) {
    super();
    this.itemType = opts.itemType ?? DEFAULT_ITEM_TYPE;
    this.secret = generateSecretFromItems(
      this.itemType.items,
      4,
      this.itemType.allowRepeat ?? false
    );

    // Add animated background
    this.bg = new Background({
      width: app.screen.width,
      height: app.screen.height,
      particleCount: 25,
    });
    this.addChild(this.bg);

    const w = app.screen.width;
    const cx = w / 2;

    const top = 12;
    const backButton = new BackButton({
      x: 12,
      y: 12,
      onClick: () => opts.onBack(),
    });
    this.addChild(backButton);

    const toggleSize = 44;
    const musicToggle = new MusicToggle({
      x: w - 12 - toggleSize,
      y: 12,
    });
    this.addChild(musicToggle);

    const title = new Text({
      text: `教学模式 - ${this.itemType.name}`,
      style: { fontFamily: "system-ui", fontSize: 20, fill: 0x00ffcc, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = top + 28;
    this.addChild(title);

    const rulesText = new Text({
      text: this.itemType.rules,
      style: {
        fontFamily: "system-ui",
        fontSize: 11,
        fill: 0x99aabb,
        align: "center",
      },
    });
    rulesText.anchor.set(0.5, 0);
    rulesText.x = cx;
    rulesText.y = top + 52;
    this.addChild(rulesText);

    // ── 输入面板（居中偏下） ──
    const inputStartY = top + 72;
    this.inputStartY = inputStartY;
    this.guessInput = new GuessInput({
      itemType: this.itemType,
      slotSize: 48,
      slotGap: 6,
      keySize: this.itemType.ui.keySize,
      keyGap: 6,
      keyFontSize: this.itemType.ui.fontSize,
      slotFontSize: this.itemType.ui.slotFontSize,
      allowRepeat: this.itemType.allowRepeat ?? false,
      actionWidth: 88,
      actionFontSize: 13,
      onSubmit: (guess) => this._confirm(guess),
    });
    this.guessInput.x = cx;
    this.guessInput.y = inputStartY;
    this.addChild(this.guessInput);

    // ── 结果卡片（悬浮在输入面板上方，初始隐藏）── 必须在输入面板之后添加，确保不被遮挡
    this.resultCard = this._buildResultCard(w);
    this.resultCard.visible = false;
    // 卡片位置：输入面板顶部上方一点
    this.resultCard.x = cx;
    this.resultCard.y = inputStartY - 10; // 在输入面板上方
    this.addChild(this.resultCard);

    // ── 历史记录（右上角） ──
    this.historyContainer = new Container();
    this.historyContainer.x = w - 8;
    this.historyContainer.y = top + 52;
    this.addChild(this.historyContainer);
    this._drawHistoryHeader();

    // Start animation
    this.app.ticker.add(this._animate, this);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    if (this._resultAnimRaf) cancelAnimationFrame(this._resultAnimRaf);
    if (this._resultHideTimer) clearTimeout(this._resultHideTimer);
    this.app.ticker.remove(this._animate, this);
    super.destroy(options);
  }

  private _animate = (): void => {
    this.bg.animate();
  };

  // ════════════════════════════════════════
  //  结果卡片
  // ════════════════════════════════════════

  private _buildResultCard(screenW: number): Container {
    const card = new Container();

    const bg = new Graphics();
    card.addChild(bg);
    this.resultCardBg = bg;

    // 4 个数字槽位
    const digits: Text[] = [];
    const boxes: Graphics[] = [];
    const digitBoxW = 44;
    for (let i = 0; i < 4; i++) {
      const box = new Graphics();
      box.roundRect(-digitBoxW / 2, -22, digitBoxW, 44, 8).fill({ color: 0x0e1a24 });
      box.roundRect(-digitBoxW / 2, -22, digitBoxW, 44, 8).stroke({ width: 1.5, color: 0x334455, alpha: 0.5 });
      card.addChild(box);
      boxes.push(box);

      const t = new Text({
        text: "?",
        style: {
          fontFamily: "system-ui",
          fontSize: 26,
          fill: 0xdffff7,
          fontWeight: "bold",
          dropShadow: { color: 0x00ffcc, blur: 4, alpha: 0.5, angle: 0, distance: 0 },
        },
      });
      t.anchor.set(0.5);
      digits.push(t);
      card.addChild(t);
    }
    this.resultDigits = digits;
    this.resultDigitBoxes = boxes;

    // AB 结果文字
    const abText = new Text({
      text: "",
      style: {
        fontFamily: "system-ui, monospace",
        fontSize: 28,
        fontWeight: "900",
        letterSpacing: 2,
      },
    });
    abText.anchor.set(0.5);
    card.addChild(abText);
    this.resultAbText = abText;

    // 定位：卡片居中，在输入面板上方
    card.x = screenW / 2;
    card.y = 160; // 在标题下方

    return card;
  }

  private _layoutResultCard(): void {
    const digitBoxW = 44;
    const gap = 6;
    const totalW = 4 * digitBoxW + 3 * gap;
    const startX = -totalW / 2 + digitBoxW / 2;

    for (let i = 0; i < 4; i++) {
      const x = startX + i * (digitBoxW + gap);
      this.resultDigitBoxes[i].position.set(x, -18);
      this.resultDigits[i].position.set(x, -17);
    }

    this.resultAbText.position.set(0, 22);
  }

  private _showResultCard(guess: string, a: number, b: number): void {
    if (this._resultAnimRaf) cancelAnimationFrame(this._resultAnimRaf);
    if (this._resultHideTimer) clearTimeout(this._resultHideTimer);

    // 卡片作为临时浮层，悬浮在输入面板中上部（覆盖键盘，2 秒后自动消失）
    const baseY = this.inputStartY + 96;

    // 填充数字
    const chars = Array.from(guess);
    for (let i = 0; i < 4; i++) {
      const d = this.resultDigits[i];
      d.text = chars[i] ?? "?";
      d.style.fill = 0xeafffb;
    }

    // AB 文字配色
    const isWin = a === 4;
    this.resultAbText.text = `${a}A ${b}B`;
    this.resultAbText.style.fill = isWin ? 0x35ffa8 : 0xffd93d;
    this.resultAbText.style.dropShadow = isWin
      ? { color: 0x35ffa8, blur: 10, alpha: 0.7, angle: 0, distance: 0 }
      : { color: 0xffd93d, blur: 8, alpha: 0.6, angle: 0, distance: 0 };

    // 绘制卡片背景
    const cardW = 220;
    const cardH = 82;
    this.resultCardBg.clear();
    // 外发光
    this.resultCardBg.roundRect(-cardW / 2 - 4, -cardH / 2 - 4, cardW + 8, cardH + 8, 14).fill({
      color: isWin ? 0x35ffa8 : 0xffd93d,
      alpha: 0.15,
    });
    // 主体
    this.resultCardBg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 12).fill({ color: 0x0c1822, alpha: 0.96 });
    // 边框
    this.resultCardBg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 12).stroke({
      width: 2,
      color: isWin ? 0x35ffa8 : 0xffd93d,
      alpha: 0.85,
    });

    this._layoutResultCard();

    // 入场动画
    this.resultCard.visible = true;
    this.resultCard.alpha = 0;
    this.resultCard.scale.set(0.6);
    this.resultCard.y = baseY + 26;

    const startTime = Date.now();
    const duration = 320;

    const step = () => {
      const t = Math.min((Date.now() - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      this.resultCard.alpha = eased;
      this.resultCard.scale.set(0.6 + 0.4 * eased);
      this.resultCard.y = baseY + 26 + (baseY - (baseY + 26)) * eased;
      if (t < 1) {
        this._resultAnimRaf = requestAnimationFrame(step);
      }
    };
    this._resultAnimRaf = requestAnimationFrame(step);

    // 2 秒后淡出
    this._resultHideTimer = setTimeout(() => this._hideResultCard(), 2200);
  }

  private _hideResultCard(): void {
    const startTime = Date.now();
    const duration = 280;
    const startAlpha = this.resultCard.alpha;
    const startY = this.resultCard.y;

    const step = () => {
      const t = Math.min((Date.now() - startTime) / duration, 1);
      const eased = t * t; // easeInQuad — 加速消失
      this.resultCard.alpha = startAlpha * (1 - eased);
      this.resultCard.y = startY - 16 * eased;
      if (t < 1) {
        this._resultAnimRaf = requestAnimationFrame(step);
      } else {
        this.resultCard.visible = false;
      }
    };
    this._resultAnimRaf = requestAnimationFrame(step);
  }

  // ════════════════════════════════════════
  //  历史记录
  // ════════════════════════════════════════

  private _drawHistoryHeader(): void {
    const header = new Text({
      text: "历史记录",
      style: {
        fontFamily: "system-ui",
        fontSize: 12,
        fill: 0x668899,
        fontWeight: "600",
        letterSpacing: 1,
      },
    });
    header.anchor.set(1, 0); // 右对齐
    this.historyContainer.addChild(header);
  }

  private _addHistoryEntry(item: HistoryItem): void {
    // 清空旧条目并重建（最多显示 6 条，避免占用过多垂直空间）
    this.historyEntries.forEach((e) => e.destroy());
    this.historyEntries = [];

    const recent = this.history.slice(-6).reverse(); // 最新的在上面

    recent.forEach((entry, idx) => {
      const row = new Container();
      row.y = 18 + idx * 34;

      // 背景条
      const bar = new Graphics();
      bar.roundRect(-130, 0, 126, 30, 6).fill({ color: 0x0c1620, alpha: 0.8 });
      bar.roundRect(-130, 0, 126, 30, 6).stroke({ width: 1, color: 0x223344, alpha: 0.5 });
      row.addChild(bar);

      // 猜测数字
      const guessText = new Text({
        text: entry.guess,
        style: {
          fontFamily: "system-ui, monospace",
          fontSize: 14,
          fill: 0xaaccdd,
          fontWeight: "bold",
        },
      });
      guessText.anchor.set(0, 0.5);
      guessText.position.set(-120, 15);
      row.addChild(guessText);

      // 箭头
      const arrow = new Text({
        text: "→",
        style: { fontFamily: "system-ui", fontSize: 13, fill: 0x556677 },
      });
      arrow.anchor.set(0, 0.5);
      arrow.position.set(-58, 15);
      row.addChild(arrow);

      // A 值（绿色）
      const aBadge = new Graphics();
      aBadge.circle(0, 15, 9).fill({ color: 0x1a3a2e });
      aBadge.circle(0, 15, 9).stroke({ width: 1.5, color: 0x35ffa8, alpha: 0.8 });
      row.addChild(aBadge);

      const aText = new Text({
        text: `${entry.a}A`,
        style: { fontFamily: "system-ui", fontSize: 11, fill: 0x35ffa8, fontWeight: "bold" },
      });
      aText.anchor.set(0.5);
      aText.position.set(0, 15);
      row.addChild(aText);

      // B 值（黄色）
      const bBadge = new Graphics();
      bBadge.circle(26, 15, 9).fill({ color: 0x3a3018 });
      bBadge.circle(26, 15, 9).stroke({ width: 1.5, color: 0xffd93d, alpha: 0.75 });
      row.addChild(bBadge);

      const bText = new Text({
        text: `${entry.b}B`,
        style: { fontFamily: "system-ui", fontSize: 11, fill: 0xffd93d, fontWeight: "bold" },
      });
      bText.anchor.set(0.5);
      bText.position.set(26, 15);
      row.addChild(bText);

      // 最新一条高亮边框
      if (idx === 0) {
        bar.clear();
        bar.roundRect(-130, 0, 126, 30, 6).fill({ color: 0x102028, alpha: 0.92 });
        bar.roundRect(-130, 0, 126, 30, 6).stroke({ width: 1.5, color: 0x00ffcc, alpha: 0.45 });
      }

      this.historyContainer.addChild(row);
      this.historyEntries.push(row);
    });

    // 入场动画：最新条目从右滑入
    if (this.historyEntries.length > 0) {
      const newest = this.historyEntries[0];
      newest.x = 40;
      newest.alpha = 0;
      const start = Date.now();
      const dur = 200;
      const anim = () => {
        const t = Math.min((Date.now() - start) / dur, 1);
        const e = 1 - Math.pow(1 - t, 2);
        newest.x = 40 * (1 - e);
        newest.alpha = e;
        if (t < 1) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    }
  }

  // ════════════════════════════════════════
  //  提交逻辑
  // ════════════════════════════════════════

  private _confirm(guess: string): void {
    if (this.gameEnded) return;
    if (!isValidGuessForItems(guess, this.itemType.items, 4, this.itemType.allowRepeat ?? false)) {
      // 无效输入也用结果卡片提示错误
      this._showErrorCard("请输入 4 个有效物品");
      return;
    }
    const { a, b } = evaluate(this.secret, guess);
    this.history.push({ guess, a, b });
    this._addHistoryEntry({ guess, a, b });
    this._showResultCard(guess, a, b);

    if (a === 4) {
      this.gameEnded = true;
      this.guessInput.setEnabled(false);
      // 猜中后卡片不自动消失
      if (this._resultHideTimer) clearTimeout(this._resultHideTimer);
      // 显示"猜中了！"覆盖
      setTimeout(() => {
        const winText = new Text({
          text: "🎉 猜中了！",
          style: {
            fontFamily: "system-ui",
            fontSize: 22,
            fill: 0x35ffa8,
            fontWeight: "bold",
            dropShadow: { color: 0x35ffa8, blur: 12, alpha: 0.8, angle: 0, distance: 0 },
          },
        });
        winText.anchor.set(0.5);
        winText.y = 78;
        this.resultCard.addChild(winText);
      }, 400);
      return;
    }
  }

  private _showErrorCard(msg: string): void {
    if (this._resultAnimRaf) cancelAnimationFrame(this._resultAnimRaf);
    if (this._resultHideTimer) clearTimeout(this._resultHideTimer);

    this.resultAbText.text = msg;
    this.resultAbText.style.fill = 0xff5566;
    this.resultAbText.style.dropShadow = { color: 0xff5566, blur: 6, alpha: 0.5, angle: 0, distance: 0 };
    this.resultAbText.position.set(0, 42);

    // 隐藏数字位
    this.resultDigits.forEach((d) => { d.text = ""; });

    const cardW = 220;
    const cardH = 60;
    this.resultCardBg.clear();
    this.resultCardBg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 12).fill({ color: 0x1a1015, alpha: 0.95 });
    this.resultCardBg.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 12).stroke({
      width: 2,
      color: 0xff5566,
      alpha: 0.7,
    });

    const errBaseY = this.inputStartY + 96;
    this.resultCard.visible = true;
    this.resultCard.alpha = 0;
    this.resultCard.scale.set(0.8);
    this.resultCard.y = errBaseY + 20;

    const startTime = Date.now();
    const duration = 250;
    const step = () => {
      const t = Math.min((Date.now() - startTime) / duration, 1);
      const e = 1 - Math.pow(1 - t, 3);
      this.resultCard.alpha = e;
      this.resultCard.scale.set(0.8 + 0.2 * e);
      this.resultCard.y = errBaseY + 20 * (1 - e);
      if (t < 1) this._resultAnimRaf = requestAnimationFrame(step);
    };
    this._resultAnimRaf = requestAnimationFrame(step);

    this._resultHideTimer = setTimeout(() => this._hideResultCard(), 1500);
  }
}
