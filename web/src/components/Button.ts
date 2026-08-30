import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { playClick } from "@/audio/click";

const PAD_X = 32;
const PAD_Y = 16;
const RADIUS = 12;

export interface ButtonOptions {
  label: string;
  width?: number;
  height?: number;
  fillColor?: number;
  fillHover?: number;
  fontSize?: number;
  onClick: () => void;
  playSound?: boolean; // 是否播放点击音效，默认true
}

export class Button extends Container {
  private bg: Graphics;
  private glow: Graphics;
  private edgeGlow: Graphics;
  private labelText: Text;
  private fillColor: number;
  private fillHover: number;
  private _w: number;
  private _h: number;
  private animFrame: number = 0;
  private playSound: boolean;
  private hovered = false;

  constructor(opts: ButtonOptions) {
    super();
    this.fillColor = opts.fillColor ?? 0x1a2332;
    this.fillHover = opts.fillHover ?? 0x243447;
    this.playSound = opts.playSound ?? true; // 默认播放音效
    this.eventMode = "static";
    this.cursor = "pointer";

    const fontSize = opts.fontSize ?? 20;
    this.labelText = new Text({
      text: opts.label,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize,
        fill: 0x00ffcc,
        fontWeight: "600",
        dropShadow: {
          color: 0x00ffcc,
          blur: 4,
          alpha: 0.3,
          distance: 0,
        },
      },
    });
    this.labelText.anchor.set(0.5);
    this._w = opts.width ?? this.labelText.width + PAD_X * 2;
    this._h = opts.height ?? this.labelText.height + PAD_Y * 2;

    // 外圈霓虹辉光层
    this.glow = new Graphics();
    this.glow.x = -this._w / 2;
    this.glow.y = -this._h / 2;
    this.glow.alpha = 0;
    this.addChild(this.glow);

    // 边框发光层
    this.edgeGlow = new Graphics();
    this.edgeGlow.x = -this._w / 2;
    this.edgeGlow.y = -this._h / 2;
    this.addChild(this.edgeGlow);

    this.bg = new Graphics();
    this._drawBg(this.fillColor, false);
    this.bg.x = -this._w / 2;
    this.bg.y = -this._h / 2;
    this.addChild(this.bg);

    this.labelText.x = 0;
    this.labelText.y = 0;
    this.addChild(this.labelText);

    this.hitArea = new Rectangle(-this._w / 2, -this._h / 2, this._w, this._h);

    this.on("pointerdown", (e) => {
      if (this.playSound) {
        playClick();
      }
      this._animatePress();
      opts.onClick();
    });
    this.on("pointerover", () => {
      this.hovered = true;
      this._drawBg(this.fillHover, true);
      this.labelText.style.fill = 0xffffff;
      this._animateHover(true);
    });
    this.on("pointerout", () => {
      this.hovered = false;
      this._drawBg(this.fillColor, false);
      this.labelText.style.fill = 0x00ffcc;
      this._animateHover(false);
    });
  }

  get width(): number {
    return this._w;
  }
  get height(): number {
    return this._h;
  }

  setLabel(text: string): void {
    this.labelText.text = text;
  }

  private _drawBg(color: number, hover: boolean): void {
    this.bg.clear();
    // 主体
    this.bg.roundRect(0, 0, this._w, this._h, RADIUS).fill({ color });
    // 顶部玻璃反光
    this.bg
      .roundRect(2, 2, this._w - 4, this._h * 0.42, RADIUS - 4)
      .fill({ color: 0xffffff, alpha: hover ? 0.08 : 0.05 });
    // 边框
    this.bg.roundRect(0, 0, this._w, this._h, RADIUS).stroke({
      width: 2,
      color: 0x00ffcc,
      alpha: hover ? 0.85 : 0.3,
    });

    // 外圈柔和辉光
    this.glow.clear();
    this.glow.roundRect(0, 0, this._w, this._h, RADIUS).fill({
      color: 0x00ffcc,
      alpha: 0.15,
    });

    // 边框外侧霓虹光
    this.edgeGlow.clear();
    this.edgeGlow.roundRect(-4, -4, this._w + 8, this._h + 8, RADIUS + 4).stroke({
      width: hover ? 5 : 3,
      color: 0x00ffcc,
      alpha: hover ? 0.35 : 0.1,
    });
  }

  private _animateHover(entering: boolean): void {
    const targetAlpha = entering ? 0.7 : 0;
    const targetScale = entering ? 1.05 : 1;

    const duration = 200;
    const startTime = Date.now();
    const startAlpha = this.glow.alpha;
    const startScale = this.scale.x;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      this.glow.alpha = startAlpha + (targetAlpha - startAlpha) * eased;
      const newScale = startScale + (targetScale - startScale) * eased;
      this.scale.set(newScale);

      if (progress < 1) {
        this.animFrame = requestAnimationFrame(animate);
      }
    };

    cancelAnimationFrame(this.animFrame);
    animate();
  }

  private _animatePress(): void {
    const duration = 100;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      let scale: number;
      if (progress < 0.5) {
        scale = 1.05 - 0.1 * (progress / 0.5);
      } else {
        scale = 0.95 + 0.1 * ((progress - 0.5) / 0.5);
      }

      this.scale.set(scale);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    cancelAnimationFrame(this.animFrame);
    super.destroy(options);
  }
}
