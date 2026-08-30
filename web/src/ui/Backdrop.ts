import { Container, Graphics } from "pixi.js";
import { Color, mixColor } from "./theme";

export interface BackdropOptions {
  width: number;
  height: number;
  /** 漂浮粒子数量 */
  particleCount?: number;
  /** 是否绘制网格 */
  grid?: boolean;
  /** 是否绘制扫描光带 */
  scanline?: boolean;
  /** 极光光斑强度，0-1，默认 1 */
  aurora?: number;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  phase: number;
  radius: number;
  baseAlpha: number;
}

interface Blob {
  g: Graphics;
  cx: number;
  cy: number;
  radius: number;
  color: number;
  driftX: number;
  driftY: number;
  phase: number;
}

/**
 * 全站统一的动态背景。
 *
 * 视觉构成（自下而上）：
 *   1. 深空底色
 *   2. 两团缓慢漂移的极光光斑（青 / 紫）
 *   3. 透视网格
 *   4. 漂浮粒子（带闪烁）
 *   5. 缓慢下移的扫描光带
 *   6. 四角暗角
 *
 * 调用方需在 ticker 中调用 `animate()`。
 */
export class Backdrop extends Container {
  private particles: Particle[] = [];
  private blobs: Blob[] = [];
  private scanline: Graphics | null = null;
  private w: number;
  private h: number;
  private t = 0;

  constructor(opts: BackdropOptions) {
    super();
    this.w = opts.width;
    this.h = opts.height;
    const {
      particleCount = 28,
      grid = true,
      scanline = true,
      aurora = 1,
    } = opts;

    // 1. 底色
    const base = new Graphics();
    base.rect(0, 0, this.w, this.h).fill({ color: Color.bgDeep });
    this.addChild(base);

    // 2. 极光光斑
    this._buildAurora(aurora);

    // 3. 网格
    if (grid) this._buildGrid();

    // 4. 粒子
    this._buildParticles(particleCount);

    // 5. 扫描光带
    if (scanline) this._buildScanline();

    // 6. 暗角
    this.addChild(this._buildVignette());
  }

  private _buildAurora(intensity: number): void {
    const specs: Array<{ fx: number; fy: number; r: number; color: number; a: number }> = [
      { fx: 0.22, fy: 0.18, r: 0.55, color: Color.primary, a: 0.16 },
      { fx: 0.82, fy: 0.72, r: 0.62, color: Color.secondary, a: 0.14 },
      { fx: 0.62, fy: 0.12, r: 0.38, color: Color.primary, a: 0.08 },
    ];

    const short = Math.min(this.w, this.h);
    for (const s of specs) {
      const g = new Graphics();
      this._paintBlob(g, 0, 0, s.r * short, s.color, s.a * intensity);
      g.x = s.fx * this.w;
      g.y = s.fy * this.h;
      this.addChild(g);
      this.blobs.push({
        g,
        cx: g.x,
        cy: g.y,
        radius: s.r * short,
        color: s.color,
        driftX: short * 0.05,
        driftY: short * 0.04,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  /** 用同心圆堆叠模拟径向渐变光斑 */
  private _paintBlob(
    g: Graphics,
    x: number,
    y: number,
    radius: number,
    color: number,
    peakAlpha: number,
  ): void {
    const steps = 26;
    for (let i = steps; i >= 1; i--) {
      const ratio = i / steps;
      // 平方衰减，中心亮、边缘快速淡出，接近真实高斯光斑
      const alpha = peakAlpha * Math.pow(1 - ratio, 2.1) * 0.55;
      if (alpha < 0.0015) continue;
      g.circle(x, y, radius * ratio).fill({
        color: mixColor(color, Color.bgDeep, 1 - Math.pow(1 - ratio, 1.6)),
        alpha,
      });
    }
  }

  private _buildGrid(): void {
    const g = new Graphics();
    const step = 46;
    const lineColor = mixColor(Color.primary, Color.bgDeep, 0.72);

    for (let x = 0; x <= this.w; x += step) {
      g.moveTo(x, 0).lineTo(x, this.h);
    }
    for (let y = 0; y <= this.h; y += step) {
      g.moveTo(0, y).lineTo(this.w, y);
    }
    g.stroke({ width: 1, color: lineColor, alpha: 0.45 });

    // 每隔 4 格加一条稍亮的主线，形成层次
    const major = new Graphics();
    for (let x = 0; x <= this.w; x += step * 4) {
      major.moveTo(x, 0).lineTo(x, this.h);
    }
    for (let y = 0; y <= this.h; y += step * 4) {
      major.moveTo(0, y).lineTo(this.w, y);
    }
    major.stroke({ width: 1, color: Color.primary, alpha: 0.07 });

    g.alpha = 0.5;
    this.addChild(g, major);
  }

  private _buildParticles(count: number): void {
    for (let i = 0; i < count; i++) {
      const radius = Math.random() * 1.8 + 0.8;
      const color = Math.random() > 0.45 ? Color.primary : Color.secondary;
      const g = new Graphics();
      g.circle(0, 0, radius).fill({ color, alpha: 0.5 });
      // 少量粒子外圈加一层柔光，提升质感
      if (radius > 1.8) {
        g.circle(0, 0, radius * 3).fill({ color, alpha: 0.06 });
      }
      g.x = Math.random() * this.w;
      g.y = Math.random() * this.h;
      this.addChild(g);

      this.particles.push({
        g,
        vx: (Math.random() - 0.5) * 0.22,
        vy: -(Math.random() * 0.35 + 0.12),
        phase: Math.random() * Math.PI * 2,
        radius,
        baseAlpha: Math.random() * 0.35 + 0.25,
      });
    }
  }

  private _buildScanline(): void {
    const bandH = Math.max(120, this.h * 0.22);
    const g = new Graphics();
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const ratio = i / steps;
      const alpha = 0.055 * Math.sin(ratio * Math.PI);
      if (alpha < 0.002) continue;
      g.rect(0, (bandH / steps) * i, this.w, bandH / steps + 1).fill({
        color: Color.primary,
        alpha,
      });
    }
    g.y = -bandH;
    this.addChild(g);
    this.scanline = g;
  }

  private _buildVignette(): Graphics {
    const g = new Graphics();
    const steps = 14;
    const maxR = Math.hypot(this.w, this.h) * 0.62;
    for (let i = steps; i >= 1; i--) {
      const ratio = i / steps;
      // 从外圈向内圈递减透明度，形成边缘压暗
      const alpha = 0.055 * Math.pow(1 - ratio, 1.4);
      const r = maxR * ratio;
      // 用矩形描边的方式压暗四边：绘制一个"环"
      g.rect(-r, -r, this.w + r * 2, this.h + r * 2)
        .rect(this.w / 2 - (this.w / 2 + r * 0.62), this.h / 2 - (this.h / 2 + r * 0.62), (this.w / 2 + r * 0.62) * 2, (this.h / 2 + r * 0.62) * 2)
        .cut?.();
    }
    // 上面的 cut 在部分版本不可用，改为简单可靠的四边渐变压暗
    g.clear();
    const edgeSteps = 18;
    const bandW = Math.min(this.w, this.h) * 0.28;
    for (let i = 0; i < edgeSteps; i++) {
      const ratio = i / edgeSteps;
      const alpha = 0.035 * Math.pow(1 - ratio, 1.6);
      const inset = (bandW / edgeSteps) * i;
      const thickness = bandW / edgeSteps + 1;
      g.rect(inset, inset, this.w - inset * 2, thickness);
      g.rect(inset, this.h - inset - thickness, this.w - inset * 2, thickness);
      g.rect(inset, inset, thickness, this.h - inset * 2);
      g.rect(this.w - inset - thickness, inset, thickness, this.h - inset * 2);
      g.fill({ color: Color.bgDeep, alpha });
    }
    return g;
  }

  /** 每帧调用；delta 为 ticker 的 deltaTime（可省略） */
  public animate(delta = 1): void {
    this.t += 0.012 * delta;

    // 极光漂移
    for (const b of this.blobs) {
      b.g.x = b.cx + Math.sin(this.t * 0.55 + b.phase) * b.driftX;
      b.g.y = b.cy + Math.cos(this.t * 0.42 + b.phase * 1.3) * b.driftY;
      b.g.alpha = 0.82 + Math.sin(this.t * 0.7 + b.phase) * 0.18;
    }

    // 粒子漂浮 + 闪烁
    for (const p of this.particles) {
      p.g.x += p.vx * delta;
      p.g.y += p.vy * delta;
      p.phase += 0.03 * delta;
      p.g.alpha = p.baseAlpha * (0.55 + 0.45 * Math.sin(p.phase));

      if (p.g.y < -10) {
        p.g.y = this.h + 10;
        p.g.x = Math.random() * this.w;
      }
      if (p.g.x < -10) p.g.x = this.w + 10;
      if (p.g.x > this.w + 10) p.g.x = -10;
    }

    // 扫描光带循环下移
    if (this.scanline) {
      const bandH = Math.max(120, this.h * 0.22);
      this.scanline.y += 0.55 * delta;
      if (this.scanline.y > this.h) this.scanline.y = -bandH;
    }
  }

  /** 尺寸变化时重建（如窗口 resize） */
  public resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
  }
}
