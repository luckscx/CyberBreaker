import { Container, Graphics, Text } from "pixi.js";
import { Color, Font, Radius, Size } from "@/ui/theme";
import { computeResultStripLayout } from "@/ui/layout";

export interface ResultBannerOptions {
  width: number;
  /** 条带高度，默认 40 */
  height?: number;
  /** 空闲时显示的说明文案 */
  idleText?: string;
}

/**
 * 统一的「本次猜测结果」反馈条。
 *
 * 这是修掉「手机上猜数字交互问题很大」的关键一步：
 * 旧实现把结果做成一张卡片，浮在 `inputStartY + 96`，高度 82px，
 * 正好压在键盘第 1~2 行上，而且要停留 2.2 秒；卡片本身又没有设 eventMode，
 * 于是**点击会穿透到被遮住的按键上**——玩家看不到键却已经输入了。
 *
 * 现在结果反馈有自己固定的高度带（永远在键盘上方），
 * 既不遮挡任何可点区域，也不会因为内容变化导致布局跳动。
 */
export class ResultBanner extends Container {
  private w: number;
  private h: number;
  private bg: Graphics;
  private idle: Text;
  private row: Container;
  private rafId = 0;

  constructor(opts: ResultBannerOptions) {
    super();
    this.w = opts.width;
    this.h = opts.height ?? 40;

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.row = new Container();
    this.row.y = this.h / 2;
    this.addChild(this.row);

    this.idle = new Text({
      text: opts.idleText ?? "A 位置对 · B 数字对",
      style: {
        fontFamily: Font.sans,
        fontSize: Size.caption,
        fill: Color.textFaint,
        align: "center",
      },
    });
    this.idle.anchor.set(0.5);
    this.idle.x = this.w / 2;
    this.idle.y = this.h / 2;
    this.addChild(this.idle);

    this._draw(null);
  }

  /** 空闲态：清空结果，回到说明文案 */
  clear(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this._draw(null);
  }

  /** 展示一次结果 */
  show(guess: string, a: number, b: number): void {
    const win = a === 4;
    this._draw({ guess, a, b, win });
    this._pop(win);
  }

  /** 展示一条错误提示（如输入不合法） */
  showError(message: string): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this._drawError(message);
  }

  private _draw(data: { guess: string; a: number; b: number; win: boolean } | null): void {
    this.row.removeChildren();
    this.bg.clear();
    this.idle.visible = !data;

    const color = data ? (data.win ? Color.success : Color.warning) : Color.line;
    this.bg
      .roundRect(0, 0, this.w, this.h, Radius.md)
      .fill({ color: data ? (data.win ? 0x11331f : Color.bgPanel) : Color.bgPanel, alpha: data ? 0.95 : 0.45 });
    this.bg
      .roundRect(0, 0, this.w, this.h, Radius.md)
      .stroke({ width: data ? 1.4 : 1, color, alpha: data ? 0.8 : 0.5 });

    if (!data) return;

    // ── 单行居中排布：4 个物品 + 箭头 + A/B 徽章 ──
    // 位置来自纯函数：先排布 → 量总宽 → 整体居中，
    // 避免手写 total 公式与实际排布不一致（旧实现内容会整体偏右）。
    const L = computeResultStripLayout(this.w, this.h);
    const chars = Array.from(data.guess);

    for (let i = 0; i < 4; i++) {
      const chip = L.chipSize;
      const cx = L.chipCenters[i];

      const g = new Graphics();
      g.roundRect(cx - chip / 2, -chip / 2, chip, chip, 7).fill({
        color: data.win ? 0x1b4030 : 0x18243a,
        alpha: 0.95,
      });
      g.roundRect(cx - chip / 2, -chip / 2, chip, chip, 7).stroke({
        width: 1,
        color: data.win ? Color.success : Color.lineStrong,
        alpha: 0.75,
      });
      this.row.addChild(g);

      const t = new Text({
        text: chars[i] ?? "",
        style: {
          fontFamily: Font.mono,
          fontSize: Math.round(chip * 0.62),
          fill: data.win ? Color.primarySoft : Color.text,
          fontWeight: "bold",
        },
      });
      t.anchor.set(0.5);
      t.x = cx;
      this.row.addChild(t);
    }

    const arrow = new Text({
      text: "→",
      style: { fontFamily: Font.sans, fontSize: 14, fill: Color.textFaint },
    });
    arrow.anchor.set(0.5);
    arrow.x = L.arrowX;
    this.row.addChild(arrow);

    this._badge(
      L.aBadgeX,
      `${data.a}A`,
      data.a > 0 ? Color.success : Color.textFaint,
      L.badgeR
    );
    this._badge(
      L.bBadgeX,
      `${data.b}B`,
      data.b > 0 ? Color.accent : Color.textFaint,
      L.badgeR
    );
  }

  private _badge(x: number, label: string, color: number, r: number): void {
    const g = new Graphics();
    g.circle(x, 0, r).fill({ color: 0x000000, alpha: 0.35 });
    g.circle(x, 0, r).stroke({ width: 1.4, color, alpha: 0.9 });
    this.row.addChild(g);

    const t = new Text({
      text: label,
      style: { fontFamily: Font.mono, fontSize: Size.micro + 1, fill: color, fontWeight: "bold" },
    });
    t.anchor.set(0.5);
    t.x = x;
    this.row.addChild(t);
  }

  private _drawError(message: string): void {
    this.row.removeChildren();
    this.idle.visible = false;
    this.bg.clear();
    this.bg
      .roundRect(0, 0, this.w, this.h, Radius.md)
      .fill({ color: 0x2a1218, alpha: 0.95 });
    this.bg
      .roundRect(0, 0, this.w, this.h, Radius.md)
      .stroke({ width: 1.4, color: Color.danger, alpha: 0.8 });

    const t = new Text({
      text: message,
      style: { fontFamily: Font.sans, fontSize: Size.bodySm, fill: Color.danger, fontWeight: "600" },
    });
    t.anchor.set(0.5);
    t.x = this.w / 2;
    t.y = this.h / 2;
    this.row.addChild(t);
  }

  /** 轻微弹入，让「刚发生了什么」一眼可见，但不阻塞操作 */
  private _pop(win: boolean): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const dur = win ? 420 : 260;
    const start = Date.now();
    const step = () => {
      if (this.destroyed) return;
      const t = Math.min((Date.now() - start) / dur, 1);
      const s = 1 + (win ? 0.1 : 0.05) * (1 - t) * Math.cos(t * Math.PI * 1.5);
      this.row.scale.set(s);
      if (t < 1) this.rafId = requestAnimationFrame(step);
      else {
        this.row.scale.set(1);
        this.rafId = 0;
      }
    };
    this.rafId = requestAnimationFrame(step);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    super.destroy(options);
  }
}
