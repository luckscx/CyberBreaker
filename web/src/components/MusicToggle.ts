import { Container, Graphics, Text } from "pixi.js";
import { isBgmPaused, toggleBgmPaused } from "../audio/bgm";
import { playClick } from "@/audio/click";

export interface MusicToggleOptions {
  size?: number;
  x?: number;
  y?: number;
}

/**
 * 全局音乐开关组件
 * 显示在屏幕右上角，点击切换音乐开关状态
 */
export class MusicToggle extends Container {
  private bg: Graphics;
  private iconText: Text;
  private size: number;

  constructor(opts: MusicToggleOptions = {}) {
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
      text: this._getIcon(),
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
      toggleBgmPaused();
      this._updateIcon();
    });

    this.on("pointerover", () => {
      this._drawBackground(true);
    });

    this.on("pointerout", () => {
      this._drawBackground(false);
    });
  }

  private _getIcon(): string {
    return isBgmPaused() ? "🔇" : "🔊";
  }

  private _updateIcon(): void {
    this.iconText.text = this._getIcon();
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

  /**
   * 更新图标状态（例如从外部改变了音乐状态时调用）
   */
  public refresh(): void {
    this._updateIcon();
  }
}
