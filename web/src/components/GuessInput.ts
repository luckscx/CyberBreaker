import { Container, Graphics, Text } from "pixi.js";
import { KeyButton } from "./KeyButton";

const DIGITS_1_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]; // 用于隐藏已选数字
const COLS = 3;

export interface GuessInputOptions {
  /** 输入槽尺寸，默认 50 */
  slotSize?: number;
  /** 输入槽间距，默认 8 */
  slotGap?: number;
  /** 按键尺寸，默认 64 */
  keySize?: number;
  /** 按键间距，默认 8 */
  keyGap?: number;
  /** 按键字号，默认 22 */
  keyFontSize?: number;
  /** 槽内字号，默认 20 */
  slotFontSize?: number;
  /** 是否允许重复数字，默认 false */
  allowRepeat?: boolean;
  /** 确认按钮文本，默认 "✓ 确认" */
  confirmLabel?: string;
  /** 退格按钮文本，默认 "⌫ 退格" */
  backspaceLabel?: string;
  /** 操作按钮宽度，默认 90 */
  actionWidth?: number;
  /** 操作按钮字号，默认 14 */
  actionFontSize?: number;
  /** 提交回调，传入 4 位字符串 */
  onSubmit: (guess: string) => void;
  /** 为 true 时不渲染 4 格槽，只渲染键盘（用于外接自定义槽，如关卡模式） */
  showSlots?: boolean;
  /** 输入变化时回调（用于与外部状态同步） */
  onGuessChange?: (guess: string) => void;
  /** 被排除的数字，这些数字键将隐藏（如关卡道具） */
  eliminatedDigits?: string[];
}

/**
 * 可复用的 4 格输入 + 数字键盘 + 退格/提交 组件。
 * 整个组件以中心 x=0 对齐，y 从 0 开始向下排列。
 * 调用方只需设置 this.x / this.y 即可定位。
 */
export class GuessInput extends Container {
  private slotSize: number;
  private slotGap: number;
  private keySize: number;
  private keyGap: number;
  private allowRepeat: boolean;
  private onSubmit: (guess: string) => void;

  private _guess = "";
  private slotContainer: Container | null = null;
  private digitButtons: KeyButton[] = [];
  private backspaceBtn: KeyButton;
  private confirmBtn: KeyButton;
  private _enabled = true;
  private _totalHeight = 0;
  private _eliminatedDigits: string[] = [];
  private onGuessChange?: (guess: string) => void;

  /** 当前输入内容 */
  get guess(): string { return this._guess; }

  /** 组件总高度（从 slot 顶部到操作按钮底部） */
  get totalHeight(): number { return this._totalHeight; }

  constructor(opts: GuessInputOptions) {
    super();

    this.slotSize = opts.slotSize ?? 50;
    this.slotGap = opts.slotGap ?? 8;
    this.keySize = opts.keySize ?? 64;
    this.keyGap = opts.keyGap ?? 8;
    this.allowRepeat = opts.allowRepeat ?? false;
    this.onSubmit = opts.onSubmit;
    this.onGuessChange = opts.onGuessChange;
    this._eliminatedDigits = opts.eliminatedDigits ?? [];

    const showSlots = opts.showSlots !== false;
    const slotFontSize = opts.slotFontSize ?? 20;
    const keyFontSize = opts.keyFontSize ?? 22;
    const confirmLabel = opts.confirmLabel ?? "✓ 确认";
    const backspaceLabel = opts.backspaceLabel ?? "⌫ 退格";
    const actionWidth = opts.actionWidth ?? 90;
    const actionFontSize = opts.actionFontSize ?? 14;

    const SG = this.slotGap;
    const KS = this.keySize;
    const KG = this.keyGap;
    const keypadW = COLS * KS + (COLS - 1) * KG;
    // 让 4 个槽总宽与键盘一致，横向对齐
    const SS = Math.max(36, (keypadW - 3 * SG) / 4);

    // ── Slots ──（可选，关卡模式用 showSlots: false 仅键盘）
    let keypadY: number;
    if (showSlots) {
      this.slotContainer = new Container();
      const slotsW = 4 * SS + 3 * SG;
      for (let i = 0; i < 4; i++) {
        const box = new Graphics();
        box.roundRect(-SS / 2, -SS / 2, SS, SS, 6).fill({ color: 0x1a2332 });
        box.roundRect(-SS / 2, -SS / 2, SS, SS, 6).stroke({ width: 1, color: 0x334455 });
        box.x = i * (SS + SG);
        this.slotContainer.addChild(box);

        const text = new Text({
          text: "?",
          style: { fontFamily: "system-ui", fontSize: slotFontSize, fill: 0x00ffcc },
        });
        text.anchor.set(0.5);
        text.x = i * (SS + SG);
        text.name = `slot-${i}`;
        this.slotContainer.addChild(text);
      }
      this.slotContainer.x = -slotsW / 2 + SS / 2;
      this.slotContainer.y = SS / 2;
      this.addChild(this.slotContainer);
      keypadY = SS + this.slotContainer.height + this.slotGap;
    } else {
      keypadY = 0;
    }

    // 1～9 三行
    DIGITS_1_9.forEach((digit, i) => {
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      const btn = new KeyButton({
        label: String(digit),
        width: KS,
        height: KS,
        fontSize: keyFontSize,
        onClick: () => this._addDigit(digit),
      });
      btn.x = -keypadW / 2 + KS / 2 + col * (KS + KG);
      btn.y = keypadY + row * (KS + KG);
      this.addChild(btn);
      this.digitButtons.push(btn);
    });

    // 第四行：退格(左) | 0(中) | 确认(右)，与数字键同款 3D KeyButton
    const row3Y = keypadY + 3 * (KS + KG);

    this.backspaceBtn = new KeyButton({
      label: backspaceLabel,
      width: KS,
      height: KS,
      fontSize: actionFontSize,
      onClick: () => this._backspace(),
    });
    this.backspaceBtn.x = -keypadW / 2 + KS / 2;
    this.backspaceBtn.y = row3Y;
    this.addChild(this.backspaceBtn);

    const zeroBtn = new KeyButton({
      label: "0",
      width: KS,
      height: KS,
      fontSize: keyFontSize,
      onClick: () => this._addDigit(0),
    });
    zeroBtn.x = -keypadW / 2 + KS / 2 + (KS + KG);
    zeroBtn.y = row3Y;
    this.addChild(zeroBtn);
    this.digitButtons.push(zeroBtn);

    this.confirmBtn = new KeyButton({
      label: confirmLabel,
      width: KS,
      height: KS,
      fontSize: actionFontSize,
      onClick: () => this._submit(),
    });
    this.confirmBtn.x = -keypadW / 2 + KS / 2 + 2 * (KS + KG);
    this.confirmBtn.y = row3Y;
    this.addChild(this.confirmBtn);

    this._totalHeight = row3Y + KS + 4;
    this._refreshSlots();
  }

  /** 清空当前输入 */
  clear(): void {
    this._guess = "";
    this._refreshSlots();
  }

  /** 从外部同步当前输入（如关卡模式与 state 同步） */
  setGuess(guess: string): void {
    this._guess = guess.slice(0, 4).replace(/\D/g, "");
    this._refreshSlots();
  }

  /** 设置被排除的数字并刷新按键可见性 */
  setEliminatedDigits(digits: string[]): void {
    this._eliminatedDigits = digits;
    this._refreshSlots();
  }

  /** 启用/禁用所有交互 */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this.digitButtons.forEach((b) => {
      b.eventMode = enabled ? "static" : "none";
      b.alpha = enabled ? 1 : 0.4;
    });
    this.backspaceBtn.eventMode = enabled ? "static" : "none";
    this.backspaceBtn.alpha = enabled ? 1 : 0.4;
    this.confirmBtn.eventMode = enabled ? "static" : "none";
    this.confirmBtn.alpha = enabled ? 1 : 0.4;
  }

  /** 隐藏已选数字 + 排除数字 */
  private _refreshSlots(): void {
    if (this.slotContainer) {
      const digits = this._guess.split("");
      for (let i = 0; i < 4; i++) {
        const t = this.slotContainer.getChildByName(`slot-${i}`) as Text;
        if (t) t.text = digits[i] ?? "?";
      }
    }
    this.digitButtons.forEach((btn, i) => {
      const d = String(DIGITS[i]);
      const hideByGuess = !this.allowRepeat && this._guess.includes(d);
      const hideByEliminated = this._eliminatedDigits.includes(d);
      btn.visible = !hideByGuess && !hideByEliminated;
    });
  }

  private _addDigit(d: number): void {
    if (!this._enabled) return;
    if (this._guess.length >= 4) return;
    if (!this.allowRepeat && this._guess.includes(String(d))) return;
    this._guess += d;
    this._refreshSlots();
    this.onGuessChange?.(this._guess);
  }

  private _backspace(): void {
    if (!this._enabled) return;
    this._guess = this._guess.slice(0, -1);
    this._refreshSlots();
    this.onGuessChange?.(this._guess);
  }

  private _submit(): void {
    if (!this._enabled) return;
    if (!/^\d{4}$/.test(this._guess)) return;
    const g = this._guess;
    this._guess = "";
    this._refreshSlots();
    this.onGuessChange?.(this._guess);
    this.onSubmit(g);
  }
}
