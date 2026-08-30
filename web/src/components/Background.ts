import { Container, Graphics } from "pixi.js";

export interface BackgroundOptions {
  width: number;
  height: number;
  particleCount?: number;
}

const CYAN = 0x00ffcc;
const MAGENTA = 0xff4dcc;
const BLUE = 0x4d9fff;

export class Background extends Container {
  private _width: number;
  private _height: number;
  private _scanY = 0;
  private _scanline: Graphics;
  private _particleAnimate: (() => void) | null = null;

  constructor(opts: BackgroundOptions) {
    super();

    const { width, height, particleCount = 30 } = opts;
    this._width = width;
    this._height = height;

    // 基底渐变
    const gradient = new Graphics();
    gradient.rect(0, 0, width, height).fill({
      color: 0x0a0e14,
      alpha: 0.88,
    });
    this.addChild(gradient);

    // 中央霓虹辉光
    const centerGlow = new Graphics();
    const glowRadius = Math.max(width, height) * 0.45;
    const cx = width / 2;
    const cy = height * 0.42;
    for (let i = 24; i > 0; i--) {
      const r = (glowRadius * i) / 24;
      centerGlow
        .circle(cx, cy, r)
        .fill({ color: i % 2 === 0 ? 0x00ffcc : 0x00a080, alpha: 0.010 });
    }
    this.addChild(centerGlow);

    // 网格
    this._addGrid(width, height);

    // 粒子
    this._addParticles(width, height, particleCount);

    // 扫描线
    this._scanline = new Graphics();
    this.addChild(this._scanline);
    this._drawScanline();

    // 暗角
    this._addVignette(width, height);
  }

  private _addParticles(width: number, height: number, count: number): void {
    const particleContainer = new Container();
    this.addChild(particleContainer);

    const particles: Array<{
      g: Graphics;
      vx: number;
      vy: number;
      life: number;
      size: number;
      color: number;
    }> = [];

    const colors = [CYAN, CYAN, CYAN, BLUE, MAGENTA];

    for (let i = 0; i < count; i++) {
      const size = Math.random() * 2 + 0.8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const g = new Graphics();
      g.circle(0, 0, size).fill({
        color,
        alpha: Math.random() * 0.35 + 0.12,
      });
      g.x = Math.random() * width;
      g.y = Math.random() * height;
      particleContainer.addChild(g);

      particles.push({
        g,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        life: Math.random() * Math.PI * 2,
        size,
        color,
      });
    }

    const animate = () => {
      particles.forEach((p) => {
        p.g.x += p.vx;
        p.g.y += p.vy;
        p.life += 0.02;
        const twinkle = 0.5 + Math.sin(p.life) * 0.5;
        p.g.alpha = (0.12 + 0.3 * twinkle) * (p.size / 3);

        if (p.g.x < 0) p.g.x = width;
        if (p.g.x > width) p.g.x = 0;
        if (p.g.y < 0) p.g.y = height;
        if (p.g.y > height) p.g.y = 0;
      });
    };

    this._particleAnimate = animate;
  }

  private _addGrid(width: number, height: number): void {
    const grid = new Graphics();
    const gridSize = 40;

    for (let x = 0; x <= width; x += gridSize) {
      grid.moveTo(x, 0);
      grid.lineTo(x, height);
    }

    for (let y = 0; y <= height; y += gridSize) {
      grid.moveTo(0, y);
      grid.lineTo(width, y);
    }

    grid.stroke({
      width: 1,
      color: CYAN,
      alpha: 0.035,
    });

    this.addChild(grid);
  }

  private _drawScanline(): void {
    const { _width: width, _scanY: y } = this;
    const bandHeight = 90;
    const stripes = 10;
    this._scanline.clear();

    for (let i = 0; i < stripes; i++) {
      const t = i / (stripes - 1);
      const alpha = 0.10 * (1 - Math.abs(t - 0.5) * 2);
      this._scanline
        .rect(0, y + i * (bandHeight / stripes), width, bandHeight / stripes + 0.6)
        .fill({ color: CYAN, alpha });
    }
  }

  private _addVignette(width: number, height: number): void {
    const vignette = new Graphics();

    // 顶部暗角
    const topH = height * 0.16;
    for (let i = 0; i < 16; i++) {
      const t = i / 16;
      vignette
        .rect(0, i * (topH / 16), width, topH / 16 + 0.5)
        .fill({ color: 0x05070c, alpha: 0.34 * (1 - t) });
    }

    // 底部暗角
    const botH = height * 0.2;
    for (let i = 0; i < 16; i++) {
      const t = i / 16;
      vignette
        .rect(0, height - botH + i * (botH / 16), width, botH / 16 + 0.5)
        .fill({ color: 0x05070c, alpha: 0.4 * t });
    }

    // 左右暗角
    const sideW = width * 0.08;
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      vignette
        .rect(i * (sideW / 12), 0, sideW / 12 + 0.5, height)
        .fill({ color: 0x05070c, alpha: 0.28 * (1 - t) });
      vignette
        .rect(width - sideW + i * (sideW / 12), 0, sideW / 12 + 0.5, height)
        .fill({ color: 0x05070c, alpha: 0.28 * (1 - t) });
    }

    this.addChild(vignette);
  }

  // 由父级 ticker 调用
  public animate(): void {
    this._particleAnimate?.();

    // 扫描线缓慢下移
    this._scanY += 1.1;
    if (this._scanY > this._height + 120) {
      this._scanY = -120;
    }
    this._drawScanline();
  }
}
