import { Container, Graphics, Text } from "pixi.js";
import { playClick } from "@/audio/click";

export interface BackButtonOptions {
  size?: number;
  x?: number;
  y?: number;
  onClick: () => void;
}

/**
 * 全局返回按钮组件
 * 显示在屏幕左上角，圆形设计，与 MusicToggle 保持一致的视觉风格
 */
export class BackButton extends Container {
  private bg: Graphics;
  private iconText: Text;
  private size: number;

  constructor(opts: BackButtonOptions) {
    super();

    this.size = opts.size ?? 48;
    this.eventMode = "static";
    this.cursor = "pointer";

    // 背景
    this.bg = new Graphics();
    this._drawBackground(false);
    this.addChild(this.bg);

    // 图标文字
    this.iconText = new Text({
      text: "🚪",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 24,
        fill: 0xffffff,
      },
    });
    this.iconText.anchor.set(0.5);
    this.iconText.position.set(this.size / 2, this.size / 2);
    this.addChild(this.iconText);

    // 设置位置
    this.position.set(opts.x ?? 0, opts.y ?? 0);

    // 交互事件
    this.on("pointerdown", () => {
      playClick();
      opts.onClick();
    });

    this.on("pointerover", () => {
      this._drawBackground(true);
    });

    this.on("pointerout", () => {
      this._drawBackground(false);
    });
  }

  private _drawBackground(hover: boolean): void {
    this.bg.clear();

    // 圆形背景
    this.bg.circle(this.size / 2, this.size / 2, this.size / 2);
    this.bg.fill({
      color: hover ? 0x243447 : 0x1a2332,
      alpha: 0.9,
    });

    // 边框
    this.bg.circle(this.size / 2, this.size / 2, this.size / 2);
    this.bg.stroke({
      width: 2,
      color: 0x00ffcc,
      alpha: hover ? 0.6 : 0.3,
    });
  }
}
