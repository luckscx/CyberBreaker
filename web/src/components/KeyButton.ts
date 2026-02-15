import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { playClick } from "@/audio/click";

const DEPTH = 6; // 3D 深度
const RADIUS = 8;

export interface KeyButtonOptions {
  label: string;
  width: number;
  height: number;
  fontSize?: number;
  onClick: () => void;
  playSound?: boolean; // 是否播放点击音效，默认true
}

export class KeyButton extends Container {
  private topFace: Graphics;
  private sideFace: Graphics;
  private bottomShadow: Graphics;
  private labelText: Text;
  private _w: number;
  private _h: number;
  private isPressed = false;
  private animFrame: number = 0;
  private currentDepth = DEPTH;
  private playSound: boolean;

  constructor(opts: KeyButtonOptions) {
    super();
    this._w = opts.width;
    this._h = opts.height;
    this.playSound = opts.playSound ?? true; // 默认播放音效
    this.eventMode = "static";
    this.cursor = "pointer";

    // Bottom shadow (最底层)
    this.bottomShadow = new Graphics();
    this.addChild(this.bottomShadow);

    // Side face (侧面 - 3D 效果)
    this.sideFace = new Graphics();
    this.addChild(this.sideFace);

    // Top face (顶面)
    this.topFace = new Graphics();
    this.addChild(this.topFace);

    // Label text
    const fontSize = opts.fontSize ?? 24;
    this.labelText = new Text({
      text: opts.label,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize,
        fill: 0x00ffcc,
        fontWeight: "bold",
        dropShadow: {
          color: 0x00ffcc,
          blur: 4,
          alpha: 0.4,
          distance: 0,
        },
      },
    });
    this.labelText.anchor.set(0.5);
    this.addChild(this.labelText);

    this.hitArea = new Rectangle(
      -this._w / 2,
      -this._h / 2 - DEPTH,
      this._w,
      this._h + DEPTH
    );

    this._draw3DButton(DEPTH);

    this.on("pointerdown", (e) => {
      if (this.playSound) {
        playClick();
      }
      this._animatePress();
      opts.onClick();
    });
    this.on("pointerover", () => this._animateHover(true));
    this.on("pointerout", () => this._animateHover(false));
  }

  get width(): number {
    return this._w;
  }
  get height(): number {
    return this._h + DEPTH;
  }

  setLabel(text: string): void {
    this.labelText.text = text;
  }

  private _draw3DButton(depth: number): void {
    const w = this._w;
    const h = this._h;

    // Bottom shadow (模糊阴影)
    this.bottomShadow.clear();
    this.bottomShadow.roundRect(-w / 2, -h / 2 + depth + 2, w, h, RADIUS).fill({
      color: 0x000000,
      alpha: 0.4,
    });
    this.bottomShadow.filters = []; // 简单模糊效果通过多层实现

    // Side face (侧面渐变 - 从深到浅)
    this.sideFace.clear();
    const sideHeight = depth;
    // 创建侧面的渐变效果（通过多个矩形叠加）
    for (let i = 0; i < sideHeight; i++) {
      const ratio = i / sideHeight;
      const color = this._interpolateColor(0x0a1420, 0x1a2636, ratio);
      this.sideFace.roundRect(
        -w / 2,
        -h / 2 + i,
        w,
        1,
        i === 0 ? RADIUS : 0
      ).fill({ color });
    }

    // Top face (顶面 - 主体)
    this.topFace.clear();
    this.topFace.y = -depth;

    // 顶面渐变（从上到下稍微变暗）
    const topGradientSteps = 10;
    for (let i = 0; i < topGradientSteps; i++) {
      const ratio = i / topGradientSteps;
      const color = this._interpolateColor(0x2a3648, 0x1a2636, ratio);
      const y = (-h / 2) + (i * h / topGradientSteps);
      this.topFace.roundRect(
        -w / 2,
        y,
        w,
        h / topGradientSteps + 1,
        i === 0 ? RADIUS : 0
      ).fill({ color });
    }

    // 顶面高光（左上角）
    this.topFace.roundRect(-w / 2, -h / 2, w, h / 3, RADIUS).fill({
      color: 0xffffff,
      alpha: 0.1,
    });

    // 顶面边框
    this.topFace.roundRect(-w / 2, -h / 2, w, h, RADIUS).stroke({
      width: 2,
      color: 0x00ffcc,
      alpha: 0.3,
    });

    // Update label position
    this.labelText.y = -depth;
  }

  private _animateHover(entering: boolean): void {
    if (this.isPressed) return;

    const targetY = entering ? -2 : 0;
    const startY = this.topFace.y + DEPTH;
    const duration = 150;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = this._easeOutCubic(progress);

      const newY = startY + (targetY - startY) * eased;
      const newDepth = DEPTH - newY;

      this._draw3DButton(newDepth);
      this.currentDepth = newDepth;

      // 悬浮时增加文字亮度
      this.labelText.alpha = entering ? 1 : 0.9;

      if (progress < 1) {
        this.animFrame = requestAnimationFrame(animate);
      }
    };

    cancelAnimationFrame(this.animFrame);
    animate();
  }

  private _animatePress(): void {
    this.isPressed = true;
    const duration = 100;
    const startTime = Date.now();
    const startDepth = this.currentDepth;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      let depth: number;
      if (progress < 0.4) {
        // Press down (快速按下)
        const pressProgress = progress / 0.4;
        depth = startDepth - startDepth * this._easeOutQuad(pressProgress);
      } else {
        // Release (慢速弹回)
        const releaseProgress = (progress - 0.4) / 0.6;
        depth = DEPTH * this._easeOutElastic(releaseProgress);
      }

      this._draw3DButton(Math.max(0, depth));
      this.currentDepth = depth;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.isPressed = false;
      }
    };

    animate();
  }

  private _easeOutQuad(t: number): number {
    return t * (2 - t);
  }

  private _easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  private _easeOutElastic(t: number): number {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
      ? 0
      : t === 1
      ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }

  private _interpolateColor(color1: number, color2: number, ratio: number): number {
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;

    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;

    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);

    return (r << 16) | (g << 8) | b;
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    cancelAnimationFrame(this.animFrame);
    super.destroy(options);
  }
}
