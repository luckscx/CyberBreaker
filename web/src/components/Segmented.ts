import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { playClick } from "@/audio/click";
import { Color, Font, Radius, Size } from "@/ui/theme";

export interface SegmentedOptions {
  width: number;
  /** 控件高度，默认 34 */
  height?: number;
  options: string[];
  /** 初始选中项，默认 0 */
  active?: number;
  onChange: (index: number) => void;
}

/**
 * 分段切换控件（用于「我方 / 对方」「我的 / 公开」这类视图切换）。
 *
 * 联机页面原本把双方历史用两列 12px 纯文本并排塞在屏幕下方，
 * 手机上既看不清也放不下。改成「分段切换 + 全宽历史板」后，
 * 一块历史板吃满宽度，A/B 徽章才有足够空间显示清楚。
 */
export class Segmented extends Container {
  private bg: Graphics;
  private indicator: Graphics;
  private labels: Text[] = [];
  private opts: SegmentedOptions;
  private _active: number;
  private _w: number;
  private _h: number;

  constructor(opts: SegmentedOptions) {
    super();
    this.opts = opts;
    this._w = opts.width;
    this._h = opts.height ?? 34;
    this._active = opts.active ?? 0;

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.indicator = new Graphics();
    this.addChild(this.indicator);

    const segW = this._w / opts.options.length;
    opts.options.forEach((label, i) => {
      const t = new Text({
        text: label,
        style: {
          fontFamily: Font.sans,
          fontSize: Size.bodySm,
          fontWeight: "600",
          fill: Color.textSub,
        },
      });
      t.anchor.set(0.5);
      t.position.set(segW * i + segW / 2, this._h / 2);
      this.addChild(t);
      this.labels.push(t);
    });

    this.eventMode = "static";
    this.cursor = "pointer";
    this.hitArea = new Rectangle(0, 0, this._w, this._h);
    this.on("pointertap", (e) => {
      const local = e.getLocalPosition(this);
      const idx = Math.max(
        0,
        Math.min(opts.options.length - 1, Math.floor(local.x / segW))
      );
      if (idx === this._active) return;
      playClick();
      this.setActive(idx, true);
      this.opts.onChange(idx);
    });

    this._draw();
  }

  get active(): number {
    return this._active;
  }

  /** 更新某个选项的文案并重绘（联机页用它把双方条数写在标签上） */
  setLabel(index: number, text: string): void {
    const t = this.labels[index];
    if (!t || t.text === text) return;
    t.text = text;
    // 文案变长后重新居中
    const segW = this._segW;
    t.x = segW * index + segW / 2;
    this._syncLabels();
  }

  setActive(index: number, animate = false): void {
    const target = Math.max(0, Math.min(this.opts.options.length - 1, index));
    const changed = target !== this._active;
    this._active = target;
    this._draw();
    if (animate && changed) this._slide();
  }

  private get _segW(): number {
    return this._w / this.opts.options.length;
  }

  private _draw(): void {
    this.bg.clear();
    this.bg
      .roundRect(0, 0, this._w, this._h, Radius.md)
      .fill({ color: Color.bgDeep, alpha: 0.8 });
    this.bg
      .roundRect(0, 0, this._w, this._h, Radius.md)
      .stroke({ width: 1, color: Color.line, alpha: 0.9 });
    this._drawIndicator(this._active);
    this._syncLabels();
  }

  private _drawIndicator(index: number): void {
    this.indicator.clear();
    this.indicator
      .roundRect(index * this._segW + 2, 2, this._segW - 4, this._h - 4, Radius.sm)
      .fill({ color: Color.bgPanelHover, alpha: 0.95 });
    this.indicator
      .roundRect(index * this._segW + 2, 2, this._segW - 4, this._h - 4, Radius.sm)
      .stroke({ width: 1.2, color: Color.primary, alpha: 0.7 });
  }

  private _syncLabels(): void {
    this.labels.forEach((t, i) => {
      const on = i === this._active;
      t.style.fill = on ? Color.primary : Color.textMuted;
      t.alpha = on ? 1 : 0.85;
    });
  }

  /** 指示块切到新选项时的轻量淡入（不做位移动画，逻辑更简单也更稳） */
  private _slide(): void {
    this._drawIndicator(this._active);
    const start = Date.now();
    const dur = 160;
    const step = () => {
      if (this.destroyed) return;
      const t = Math.min((Date.now() - start) / dur, 1);
      this.indicator.alpha = 0.5 + 0.5 * t;
      if (t < 1) requestAnimationFrame(step);
      else this.indicator.alpha = 1;
    };
    step();
  }
}
