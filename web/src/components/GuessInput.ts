import { Container, Graphics, Text } from "pixi.js";
import { KeyButton } from "./KeyButton";
import type { ItemType } from "@/types/itemTypes";
import { DEFAULT_ITEM_TYPE } from "@/types/itemTypes";

export interface GuessInputOptions {
  /** 物品类型配置（如数字、水果等），默认为数字 */
  itemType?: ItemType;
  /** 输入槽尺寸，默认从 itemType.ui 读取 */
  slotSize?: number;
  /** 输入槽间距，默认 8 */
  slotGap?: number;
  /** 按键尺寸，默认从 itemType.ui 读取 */
  keySize?: number;
  /** 按键间距，默认 8 */
  keyGap?: number;
  /** 按键字号，默认从 itemType.ui 读取 */
  keyFontSize?: number;
  /** 槽内字号，默认从 itemType.ui 读取 */
  slotFontSize?: number;
  /** 是否允许重复物品，默认从 itemType.allowRepeat 读取 */
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
  /** 被排除的物品，这些按键将隐藏（如关卡道具） */
  eliminatedItems?: string[];
}

const ACCENT = 0x00ffcc;
const SLOT_CORNER = 9;

interface SlotView {
  root: Container;
  bg: Graphics;
  text: Text;
  popStart: number;
}

/**
 * 可复用的 4 格输入 + 物品键盘 + 退格/提交 组件。
 * 支持数字、水果等任意物品类型。
 * 整个组件以中心 x=0 对齐，y 从 0 开始向下排列。
 * 调用方只需设置 this.x / this.y 即可定位。
 */
export class GuessInput extends Container {
  private itemType: ItemType;
  private slotSize: number;
  private slotGap: number;
  private keySize: number;
  private keyGap: number;
  private allowRepeat: boolean;
  private onSubmit: (guess: string) => void;

  private _guess = "";
  private slotContainer: Container | null = null;
  private slotViews: SlotView[] = [];
  private itemButtons: KeyButton[] = [];
  private backspaceBtn: KeyButton;
  private confirmBtn: KeyButton;
  private _enabled = true;
  private _totalHeight = 0;
  private _totalWidth = 0;
  private _eliminatedItems: string[] = [];
  private onGuessChange?: (guess: string) => void;
  private _rafId: number = 0;

  /** 当前输入内容 */
  get guess(): string { return this._guess; }

  /** 组件总高度（从 slot 顶部到操作按钮底部） */
  get totalHeight(): number { return this._totalHeight; }

  /** 组件总宽度（键盘宽度） */
  get totalWidth(): number { return this._totalWidth; }

  constructor(opts: GuessInputOptions) {
    super();

    this.itemType = opts.itemType ?? DEFAULT_ITEM_TYPE;
    this.slotSize = opts.slotSize ?? this.itemType.ui.slotSize;
    this.slotGap = opts.slotGap ?? 8;
    this.keySize = opts.keySize ?? this.itemType.ui.keySize;
    this.keyGap = opts.keyGap ?? 8;
    this.allowRepeat = opts.allowRepeat ?? this.itemType.allowRepeat ?? false;
    this.onSubmit = opts.onSubmit;
    this.onGuessChange = opts.onGuessChange;
    this._eliminatedItems = opts.eliminatedItems ?? [];

    const showSlots = opts.showSlots !== false;
    const slotFontSize = opts.slotFontSize ?? this.itemType.ui.slotFontSize;
    const keyFontSize = opts.keyFontSize ?? this.itemType.ui.fontSize;
    const confirmLabel = opts.confirmLabel ?? "✓ 确认";
    const backspaceLabel = opts.backspaceLabel ?? "⌫ 退格";
    const actionWidth = opts.actionWidth ?? 90;
    const actionFontSize = opts.actionFontSize ?? 14;

    const SG = this.slotGap;
    const KS = this.keySize;
    const KG = this.keyGap;
    const COLS = this.itemType.ui.columns;
    const items = this.itemType.items;

    // 计算键盘布局
    const rows = Math.ceil(items.length / COLS);
    const keypadW = COLS * KS + (COLS - 1) * KG;
    this._totalWidth = keypadW;

    // 让 4 个槽总宽与键盘一致，横向对齐
    const SS = Math.max(36, (keypadW - 3 * SG) / 4);
    this.slotSize = SS;

    // ── Slots ──（可选，关卡模式用 showSlots: false 仅键盘）
    let keypadY: number;
    if (showSlots) {
      this.slotContainer = new Container();
      const slotsW = 4 * SS + 3 * SG;
      for (let i = 0; i < 4; i++) {
        const root = new Container();
        root.x = i * (SS + SG);

        const bg = new Graphics();
        root.addChild(bg);

        const text = new Text({
          text: "?",
          style: {
            fontFamily: "system-ui",
            fontSize: slotFontSize,
            fill: 0x00ffcc,
            fontWeight: "bold",
            dropShadow: { color: ACCENT, blur: 6, alpha: 0.6, distance: 0 },
          },
        });
        text.anchor.set(0.5);
        root.addChild(text);

        const view: SlotView = { root, bg, text, popStart: 0 };
        this.slotViews.push(view);
        this.slotContainer.addChild(root);
      }
      this.slotContainer.x = -slotsW / 2 + SS / 2;
      this.slotContainer.y = SS / 2;
      this.addChild(this.slotContainer);
      keypadY = SS + this.slotContainer.height + this.slotGap;
    } else {
      keypadY = 0;
    }

    // 物品按键（根据 itemType.items 动态生成）
    items.forEach((item, i) => {
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      const btn = new KeyButton({
        label: item,
        width: KS,
        height: KS,
        fontSize: keyFontSize,
        onClick: () => this._addItem(item),
      });
      btn.x = -keypadW / 2 + KS / 2 + col * (KS + KG);
      btn.y = keypadY + row * (KS + KG);
      this.addChild(btn);
      this.itemButtons.push(btn);
    });

    // 最后一行：退格 + 确认（居中显示）
    const lastRowY = keypadY + rows * (KS + KG);
    const actionBtnWidth = (keypadW - KG) / 2; // 两个按钮平分宽度

    this.backspaceBtn = new KeyButton({
      label: backspaceLabel,
      width: actionBtnWidth,
      height: KS,
      fontSize: actionFontSize,
      variant: "danger",
      onClick: () => this._backspace(),
    });
    this.backspaceBtn.x = -keypadW / 2 + actionBtnWidth / 2;
    this.backspaceBtn.y = lastRowY;
    this.addChild(this.backspaceBtn);

    this.confirmBtn = new KeyButton({
      label: confirmLabel,
      width: actionBtnWidth,
      height: KS,
      fontSize: actionFontSize,
      variant: "success",
      onClick: () => this._submit(),
    });
    this.confirmBtn.x = -keypadW / 2 + actionBtnWidth + KG + actionBtnWidth / 2;
    this.confirmBtn.y = lastRowY;
    this.addChild(this.confirmBtn);

    this._totalHeight = lastRowY + KS + 4;
    this._refreshSlots();
    this._startAnim();
  }

  /** 清空当前输入 */
  clear(): void {
    this._guess = "";
    this._refreshSlots();
  }

  /** 从外部同步当前输入（如关卡模式与 state 同步） */
  setGuess(guess: string): void {
    // 使用 Array.from 正确处理 emoji
    const items = Array.from(guess).slice(0, 4);
    this._guess = items.join("");
    this._refreshSlots();
  }

  /** 设置被排除的物品并刷新按键可见性 */
  setEliminatedItems(items: string[]): void {
    this._eliminatedItems = items;
    this._refreshSlots();
  }

  /** 设置是否允许重复物品（如等待场景规则切换后） */
  setAllowRepeat(allow: boolean): void {
    this.allowRepeat = allow;
    this._refreshSlots();
  }

  /** 启用/禁用整个组件（全部灰、不可点） */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this.itemButtons.forEach((b) => {
      b.eventMode = enabled ? "static" : "none";
      b.alpha = enabled ? 1 : 0.4;
    });
    this.backspaceBtn.eventMode = enabled ? "static" : "none";
    this.confirmBtn.eventMode = enabled ? "static" : "none";
    this.backspaceBtn.alpha = enabled ? 1 : 0.4;
    this.confirmBtn.alpha = enabled ? 1 : 0.4;
    if (!enabled) this.confirmBtn.setReady(false);
    if (enabled) this._refreshSlots(); // 重新应用各键的 disabled 状态与样式
  }

  /** 更新槽显示 + 各键 disabled：退格无输入禁用手势；未满 4 位确认禁用；不允许重复时已选物品键禁用（灰色+闷音） */
  private _refreshSlots(): void {
    const items = Array.from(this._guess);

    if (this.slotContainer) {
      for (let i = 0; i < 4; i++) {
        const view = this.slotViews[i];
        const next = items[i];
        const prev = view.text.text;
        // 内容变化且为有效填入 → 播放弹跳
        if (next && next !== prev) view.popStart = Date.now();
        view.text.text = next ?? "?";
        this._drawSlot(i);
      }
    }

    this.backspaceBtn.setDisabled(this._guess.length === 0);
    const ready = items.length === 4 && this._enabled;
    this.confirmBtn.setDisabled(items.length < 4);
    this.confirmBtn.setReady(ready);

    const guessItems = Array.from(this._guess);
    this.itemButtons.forEach((btn, i) => {
      const item = this.itemType.items[i];
      const eliminated = this._eliminatedItems.includes(item);
      const alreadyInGuess = !this.allowRepeat && guessItems.includes(item);
      btn.visible = !eliminated;
      btn.setDisabled(alreadyInGuess);
    });
  }

  /** 绘制单个输入槽：empty / active(待填) / filled 三种状态 */
  private _drawSlot(i: number): void {
    const view = this.slotViews[i];
    if (!view) return;
    const SS = this.slotSize;
    const guessItems = Array.from(this._guess);
    const filled = i < guessItems.length;
    const isActive = i === guessItems.length && i < 4;
    const t = Date.now() / 1000;

    // 待填位呼吸光
    const breathe = isActive && this._enabled ? 0.45 + 0.45 * Math.sin(t * Math.PI * 1.5) : 0;

    const g = view.bg;
    g.clear();

    // 底色
    g.roundRect(-SS / 2, -SS / 2, SS, SS, SLOT_CORNER).fill({
      color: filled ? 0x0f2a2b : 0x0e1622,
    });

    // 已填：内部辉光
    if (filled) {
      g.roundRect(-SS / 2, -SS / 2, SS, SS, SLOT_CORNER).fill({
        color: ACCENT,
        alpha: 0.13,
      });
      // 顶部高光
      g.roundRect(-SS / 2 + 2, -SS / 2 + 2, SS - 4, SS * 0.36, SLOT_CORNER - 3).fill({
        color: 0xffffff,
        alpha: 0.07,
      });
      // 底部内侧暗边
      g.roundRect(-SS / 2 + 2, SS / 2 - 7, SS - 4, 5, 3).fill({
        color: 0x000000,
        alpha: 0.25,
      });
    }

    // 边框
    let borderAlpha = 0.28;
    let borderWidth = 1.5;
    let borderColor = 0x334455;
    if (filled) {
      borderAlpha = 0.9;
      borderWidth = 2;
      borderColor = ACCENT;
    } else if (isActive) {
      borderAlpha = 0.35 + breathe * 0.6;
      borderWidth = 2;
      borderColor = ACCENT;
    }
    g.roundRect(-SS / 2, -SS / 2, SS, SS, SLOT_CORNER).stroke({
      width: borderWidth,
      color: borderColor,
      alpha: borderAlpha,
    });

    if (filled || isActive) {
      // 四角 HUD 角标
      const c = Math.min(8, SS * 0.14);
      const inset = 3.5;
      const ca = filled ? 0.85 : 0.3 + breathe * 0.6;
      const corners: Array<[number, number, number, number]> = [
        [-SS / 2 + inset, -SS / 2 + inset, c, c],
        [SS / 2 - inset, -SS / 2 + inset, -c, c],
        [-SS / 2 + inset, SS / 2 - inset, c, -c],
        [SS / 2 - inset, SS / 2 - inset, -c, -c],
      ];
      corners.forEach(([x, y, dx, dy]) => {
        g.moveTo(x, y + dy).lineTo(x, y).lineTo(x + dx, y);
      });
      g.stroke({ width: 1.4, color: ACCENT, alpha: ca });

      // 底部 LED 光条
      g.roundRect(-SS / 2 + 7, SS / 2 - 3.5, SS - 14, 2, 1).fill({
        color: ACCENT,
        alpha: filled ? 0.9 : 0.25 + breathe * 0.6,
      });
    }

    // 文本样式
    view.text.style.fill = filled ? 0xeafffb : 0x4a6478;
    view.text.alpha = filled ? 1 : isActive ? 0.75 + breathe * 0.25 : 0.55;
  }

  /** 动画循环：待填位呼吸光 + 填入弹跳 */
  private _startAnim(): void {
    const step = () => {
      if (this.destroyed) return;
      const now = Date.now();
      const guessItems = Array.from(this._guess);

      // 待填位呼吸
      if (guessItems.length < 4 && this._enabled) {
        this._drawSlot(guessItems.length);
      }

      // 填入弹跳
      this.slotViews.forEach((view) => {
        if (view.popStart > 0) {
          const t = Math.min((now - view.popStart) / 260, 1);
          const scale = 1 + 0.42 * (1 - t) * Math.cos(t * Math.PI * 1.6);
          view.text.scale.set(scale);
          if (t >= 1) {
            view.popStart = 0;
            view.text.scale.set(1);
          }
        }
      });

      this._rafId = requestAnimationFrame(step);
    };
    this._rafId = requestAnimationFrame(step);
  }

  private _addItem(item: string): void {
    if (!this._enabled) return;
    const currentItems = Array.from(this._guess);
    if (currentItems.length >= 4) return;
    if (!this.allowRepeat && currentItems.includes(item)) return;
    this._guess += item;
    this._refreshSlots();
    this.onGuessChange?.(this._guess);
  }

  private _backspace(): void {
    if (!this._enabled) return;
    const items = Array.from(this._guess);
    if (items.length === 0) return;
    items.pop();
    this._guess = items.join("");
    this._refreshSlots();
    this.onGuessChange?.(this._guess);
  }

  private _submit(): void {
    if (!this._enabled) return;
    const items = Array.from(this._guess);
    if (items.length !== 4) return;
    const g = this._guess;
    this._guess = "";
    this._refreshSlots();
    this.onGuessChange?.(this._guess);
    this.onSubmit(g);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    super.destroy(options);
  }
}
