import { Container, Graphics, Text } from "pixi.js";
import { KeyButton } from "./KeyButton";
import type { ItemType } from "@/types/itemTypes";
import { DEFAULT_ITEM_TYPE } from "@/types/itemTypes";
import { computePlayGeometry, haptic, type PlayGeometry } from "@/ui/layout";
import { Color, Font, Play } from "@/ui/theme";

export interface GuessInputOptions {
  /** 物品类型配置（如数字、水果等），默认为数字 */
  itemType?: ItemType;
  /** 提交回调，传入 4 位字符串 */
  onSubmit: (guess: string) => void;
  /** 为 true 时不渲染 4 格槽，只渲染键盘（用于外接自定义槽，如关卡模式） */
  showSlots?: boolean;
  /** 输入变化时回调（用于与外部状态同步） */
  onGuessChange?: (guess: string) => void;
  /** 被排除的物品，这些按键将标记为「已排除」且不可点 */
  eliminatedItems?: string[];
  /** 是否允许重复物品，默认从 itemType.allowRepeat 读取 */
  allowRepeat?: boolean;
  /**
   * 用于推算几何的屏幕宽度。默认取 `window.innerWidth`。
   * 场景应显式传入 `app.screen.width`，避免画布宽度与窗口宽度不一致时
   * 键盘几何与场景其余部分（槽位 / 历史板）对不上。
   */
  screenWidth?: number;
  /** 确认按钮文本，默认 "确认" */
  confirmLabel?: string;
  /** 退格按钮文本，默认 "退格" */
  backspaceLabel?: string;

  // ── 以下为兼容旧调用点保留；本次重构后玩法区尺寸统一由屏幕宽度推算，
  //    传入的尺寸类参数一律忽略（见 @/ui/layout.ts）。──
  /** @deprecated 忽略 */
  slotSize?: number;
  /** @deprecated 忽略 */
  slotGap?: number;
  /** @deprecated 忽略 */
  keySize?: number;
  /** @deprecated 忽略 */
  keyGap?: number;
  /** @deprecated 忽略 */
  keyFontSize?: number;
  /** @deprecated 忽略 */
  slotFontSize?: number;
  /** @deprecated 忽略 */
  actionWidth?: number;
  /** @deprecated 忽略 */
  actionFontSize?: number;
}

interface SlotView {
  root: Container;
  bg: Graphics;
  text: Text;
  popStart: number;
}

/** 一个格的语义：物品键 / 退格 / 确认 */
type CellKind = "item" | "backspace" | "confirm";

interface Cell {
  kind: CellKind;
  /** 物品键对应的物品字符 */
  item?: string;
}

/**
 * 统一输入组件：4 格输入槽 + 物品键盘 + 退格 / 确认。
 *
 * ── 本次重构要点 ──
 * 1. 尺寸不再由调用方各传各的（旧的 keySize 54/56/64/70 混乱局面），
 *    全部由 `computePlayGeometry()` 依屏幕宽度推算，最小边长受 Touch.minKey 保护。
 * 2. 输入槽宽度从键盘宽度反推，槽与键盘**永远等宽对齐**。
 *    （旧实现把传入的 slotSize 无条件覆盖成 39px，手机上槽小到看不清。）
 * 3. 退格 / 确认优先塞进最后一行的空位，数字键盘由 5 行降为 4 行，
 *    既省出一行给历史记录，又让退格落在拇指最容易够到的位置。
 * 4. 已排除 / 已使用的键改为「置灰标记」而不是直接隐藏，
 *    避免键盘出现空洞导致位置记忆失效（错按率↑）。
 * 5. 点按语义交给 KeyButton 的 tap 判定：按下可滑动取消，误触不再被吞。
 *
 * 坐标约定：组件以「顶部中心」为原点（x=0 居中，y=0 为槽顶 / 键盘顶）。
 * 调用方直接设置 this.x / this.y 定位；高度用 totalHeight 取得。
 */
export class GuessInput extends Container {
  private itemType: ItemType;
  private geometry: PlayGeometry;
  private allowRepeat: boolean;
  private onSubmitCb: (guess: string) => void;
  private onGuessChange?: (guess: string) => void;

  private _guess = "";
  private slotContainer: Container | null = null;
  private slotViews: SlotView[] = [];
  private itemButtons: Map<string, KeyButton> = new Map();
  private cells: Cell[] = [];
  private backspaceBtn!: KeyButton;
  private confirmBtn!: KeyButton;
  private _enabled = true;
  private _eliminatedItems: string[] = [];
  private _rafId = 0;

  /** 当前输入内容 */
  get guess(): string {
    return this._guess;
  }

  /** 组件总高度（槽顶 → 键盘底） */
  get totalHeight(): number {
    const slotsH = this.slotContainer ? this.geometry.slotRowH + Play.slotToKeypad : 0;
    return slotsH + this.geometry.keypadH;
  }

  /** 组件总宽度 */
  get totalWidth(): number {
    return this.geometry.keypadW;
  }

  /** 本组件使用的几何（供场景对齐槽位 / 键盘） */
  get layout(): PlayGeometry {
    return this.geometry;
  }

  constructor(opts: GuessInputOptions) {
    super();

    this.itemType = opts.itemType ?? DEFAULT_ITEM_TYPE;
    this.geometry = computePlayGeometry(
      opts.screenWidth ?? window.innerWidth,
      this.itemType
    );
    this.allowRepeat = opts.allowRepeat ?? this.itemType.allowRepeat ?? false;
    this.onSubmitCb = opts.onSubmit;
    this.onGuessChange = opts.onGuessChange;
    this._eliminatedItems = opts.eliminatedItems ?? [];

    const g = this.geometry;
    const showSlots = opts.showSlots !== false;

    let keypadY = 0;
    if (showSlots) {
      this._buildSlots();
      keypadY = g.slotRowH + Play.slotToKeypad;
    }
    this._buildKeypad(keypadY, opts.confirmLabel ?? "确认", opts.backspaceLabel ?? "退格");

    this._refresh();
    this._startAnim();
  }

  // ──────────────────────────── 槽位 ────────────────────────────

  private _buildSlots(): void {
    const g = this.geometry;
    const SS = g.slotSize;
    const SG = g.slotGap;

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
          fontFamily: Font.mono,
          fontSize: Math.round(SS * 0.46),
          fill: Color.primary,
          fontWeight: "bold",
        },
      });
      text.anchor.set(0.5);
      root.addChild(text);

      this.slotViews.push({ root, bg, text, popStart: 0 });
      this.slotContainer.addChild(root);
    }
    // 槽位整体居中（与键盘同宽同轴）
    this.slotContainer.x = -slotsW / 2 + SS / 2;
    this.slotContainer.y = SS / 2;
    this.addChild(this.slotContainer);
  }

  // ──────────────────────────── 键盘 ────────────────────────────

  /**
   * 构建键盘格子序列。
   * 最后一行若有 ≥2 个空位，就把 ⌫ / ✓ 填进去（数字键盘因此只有 4 行）。
   */
  private _buildKeypad(keypadY: number, confirmLabel: string, backspaceLabel: string): void {
    const g = this.geometry;
    const items = this.itemType.items;

    this.cells = items.map<Cell>((item) => ({ kind: "item", item }));
    if (g.inlineActions) {
      // 填满最后一行的剩余空位
      const lastRowStart = (g.rows - 1) * g.cols;
      const usedInLastRow = this.cells.length - lastRowStart;
      const free = g.cols - usedInLastRow;
      // 退格靠中间（拇指最易够到），确认在末位
      if (free >= 1) this.cells.push({ kind: "backspace" });
      for (let i = 1; i < free; i++) this.cells.push({ kind: "confirm" });
    } else {
      // 物品格填满整行后，动作键另起一行。
      // 用左侧留白把「⌫ / ✓」推到该行居中，避免贴在左边缘。
      const padToRowEnd = g.rows * g.cols - this.cells.length;
      const padLeft = Math.max(0, Math.floor((g.cols - 2) / 2));
      for (let i = 0; i < padToRowEnd + padLeft; i++) this.cells.push({ kind: "item", item: "" });
      this.cells.push({ kind: "backspace" }, { kind: "confirm" });
    }

    const totalRows = Math.ceil(this.cells.length / g.cols);
    const centerX = (col: number) => -g.keypadW / 2 + g.keySize / 2 + col * (g.keySize + g.keyGap);
    const centerY = (row: number) => keypadY + g.keySize / 2 + row * (g.keySize + g.keyGap);

    const actionLabel = (kind: CellKind) => (kind === "backspace" ? backspaceLabel : confirmLabel);

    this.cells.forEach((cell, i) => {
      const row = Math.floor(i / g.cols);
      const col = i % g.cols;
      if (row >= totalRows) return;

      const isBlank = cell.kind === "item" && !cell.item;
      if (isBlank) return; // 键盘留白格（非 inline 布局时的补齐位）

      const btn =
        cell.kind === "item"
          ? new KeyButton({
              label: cell.item!,
              width: g.keySize,
              height: g.keySize,
              fontSize: Play.keyFontSize,
              onClick: () => this._addItem(cell.item!),
            })
          : new KeyButton({
              label: actionLabel(cell.kind),
              width: g.keySize,
              height: g.keySize,
              fontSize: Play.actionFontSize,
              variant: cell.kind === "backspace" ? "danger" : "success",
              onClick: () => (cell.kind === "backspace" ? this._backspace() : this._submit()),
            });

      btn.x = centerX(col);
      btn.y = centerY(row);

      if (cell.kind === "item") this.itemButtons.set(cell.item!, btn);
      if (cell.kind === "backspace") this.backspaceBtn = btn;
      if (cell.kind === "confirm") this.confirmBtn = btn;

      this.addChild(btn);
    });
  }

  // ──────────────────────────── 公共 API ────────────────────────────

  /** 清空当前输入 */
  clear(): void {
    this._guess = "";
    this._refresh();
  }

  /** 从外部同步当前输入 */
  setGuess(guess: string): void {
    this._guess = Array.from(guess).slice(0, 4).join("");
    this._refresh();
  }

  /** 设置被排除的物品并刷新按键状态 */
  setEliminatedItems(items: string[]): void {
    this._eliminatedItems = items;
    this._refresh();
  }

  /** 设置是否允许重复物品 */
  setAllowRepeat(allow: boolean): void {
    this.allowRepeat = allow;
    this._refresh();
  }

  /** 启用 / 禁用整个组件 */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this.alpha = enabled ? 1 : 0.55;
    this.itemButtons.forEach((b) => {
      b.eventMode = enabled ? "static" : "none";
    });
    if (this.backspaceBtn) this.backspaceBtn.eventMode = enabled ? "static" : "none";
    if (this.confirmBtn) this.confirmBtn.eventMode = enabled ? "static" : "none";
    this._refresh();
  }

  // ──────────────────────────── 状态刷新 ────────────────────────────

  private _refresh(): void {
    const items = Array.from(this._guess);

    if (this.slotContainer) {
      for (let i = 0; i < 4; i++) {
        const view = this.slotViews[i];
        const next = items[i];
        if (next && next !== view.text.text) view.popStart = Date.now();
        view.text.text = next ?? "?";
        this._drawSlot(i);
      }
    }

    if (this.backspaceBtn) this.backspaceBtn.setDisabled(this._guess.length === 0);
    if (this.confirmBtn) {
      this.confirmBtn.setDisabled(items.length < 4);
      this.confirmBtn.setReady(items.length === 4 && this._enabled);
    }

    this.itemButtons.forEach((btn, item) => {
      const eliminated = this._eliminatedItems.includes(item);
      const used = !this.allowRepeat && items.includes(item);
      btn.setDisabled(eliminated || used);
      // 已排除 / 已使用都置灰但保留位置，键盘不会出现空洞
      btn.setMuted(eliminated || used, eliminated ? "已排除" : undefined);
    });
  }

  /** 绘制单个输入槽：empty / active / filled */
  private _drawSlot(i: number): void {
    const view = this.slotViews[i];
    if (!view) return;
    const SS = this.geometry.slotSize;
    const guessItems = Array.from(this._guess);
    const filled = i < guessItems.length;
    const isActive = i === guessItems.length && i < 4;
    const t = Date.now() / 1000;
    const breathe = isActive && this._enabled ? 0.45 + 0.45 * Math.sin(t * Math.PI * 1.5) : 0;
    const accent = Color.primary;

    const g = view.bg;
    g.clear();

    g.roundRect(-SS / 2, -SS / 2, SS, SS, Play.slotRadius).fill({
      color: filled ? 0x0f2a2b : Color.bgDeep,
      alpha: filled ? 1 : 0.75,
    });

    if (filled) {
      g.roundRect(-SS / 2, -SS / 2, SS, SS, Play.slotRadius).fill({ color: accent, alpha: 0.13 });
      g.roundRect(-SS / 2 + 2, -SS / 2 + 2, SS - 4, SS * 0.34, Play.slotRadius - 3).fill({
        color: 0xffffff,
        alpha: 0.07,
      });
    }

    let borderAlpha = 0.28;
    let borderWidth = 1.5;
    let borderColor: number = Color.lineStrong;
    if (filled) {
      borderAlpha = 0.9;
      borderWidth = 2;
      borderColor = accent;
    } else if (isActive) {
      borderAlpha = 0.35 + breathe * 0.6;
      borderWidth = 2;
      borderColor = accent;
    }
    g.roundRect(-SS / 2, -SS / 2, SS, SS, Play.slotRadius).stroke({
      width: borderWidth,
      color: borderColor,
      alpha: borderAlpha,
    });

    if (filled || isActive) {
      const c = Math.min(9, SS * 0.16);
      const inset = 4;
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
      g.stroke({ width: 1.4, color: accent, alpha: ca });
    }

    view.text.style.fill = filled ? Color.text : Color.textFaint;
    view.text.alpha = filled ? 1 : isActive ? 0.75 + breathe * 0.25 : 0.5;
  }

  /** 待填位呼吸 + 填入弹跳 */
  private _startAnim(): void {
    const step = () => {
      if (this.destroyed) return;
      const now = Date.now();
      const guessItems = Array.from(this._guess);

      if (this.slotContainer && guessItems.length < 4 && this._enabled) {
        this._drawSlot(guessItems.length);
      }

      this.slotViews.forEach((view) => {
        if (view.popStart > 0) {
          const t = Math.min((now - view.popStart) / 260, 1);
          const scale = 1 + 0.4 * (1 - t) * Math.cos(t * Math.PI * 1.6);
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

  // ──────────────────────────── 输入逻辑 ────────────────────────────

  private _addItem(item: string): void {
    if (!this._enabled) return;
    const current = Array.from(this._guess);
    if (current.length >= 4) return;
    if (!this.allowRepeat && current.includes(item)) return;
    if (this._eliminatedItems.includes(item)) return;
    this._guess += item;
    haptic(8);
    this._refresh();
    this.onGuessChange?.(this._guess);
  }

  private _backspace(): void {
    if (!this._enabled) return;
    const items = Array.from(this._guess);
    if (items.length === 0) return;
    items.pop();
    this._guess = items.join("");
    haptic(6);
    this._refresh();
    this.onGuessChange?.(this._guess);
  }

  private _submit(): void {
    if (!this._enabled) return;
    const items = Array.from(this._guess);
    if (items.length !== 4) return;
    const submitted = this._guess;
    this._guess = "";
    haptic(12);
    this._refresh();
    this.onGuessChange?.("");
    this.onSubmitCb(submitted);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    super.destroy(options);
  }
}
