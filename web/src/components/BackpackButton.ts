import { Container, Graphics, Text } from "pixi.js";
import { playClick } from "@/audio/click";

export interface BackpackButtonOptions {
  size?: number;
  x?: number;
  y?: number;
  onClick: () => void;
}

/**
 * 背包按钮组件
 * 圆形设计，显示背包图标和道具数量徽章
 */
export class BackpackButton extends Container {
  private bg: Graphics;
  private iconText: Text;
  private badge: Graphics;
  private badgeText: Text;
  private size: number;
  private itemCount: number = 0;

  constructor(opts: BackpackButtonOptions) {
    super();

    this.size = opts.size ?? 48;
    this.eventMode = "static";
    this.cursor = "pointer";

    // 背景
    this.bg = new Graphics();
    this._drawBackground(false);
    this.addChild(this.bg);

    // 图标文字（背包emoji）
    this.iconText = new Text({
      text: "🎒",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 24,
        fill: 0xffffff,
      },
    });
    this.iconText.anchor.set(0.5);
    this.iconText.position.set(this.size / 2, this.size / 2);
    this.addChild(this.iconText);

    // 徽章（显示道具数量）
    this.badge = new Graphics();
    this.badge.position.set(this.size - 10, 5);
    this.badge.visible = false;
    this.addChild(this.badge);

    // 徽章文字
    this.badgeText = new Text({
      text: "0",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    this.badgeText.anchor.set(0.5);
    this.badge.addChild(this.badgeText);

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

  /**
   * 更新道具数量徽章
   */
  updateCount(count: number): void {
    this.itemCount = count;
    this.badgeText.text = count.toString();
    this.badge.visible = count > 0;
    this._drawBadge();
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

  private _drawBadge(): void {
    this.badge.clear();

    if (this.itemCount > 0) {
      // 圆形徽章背景
      this.badge.circle(0, 0, 10);
      this.badge.fill({ color: 0xff4444 });

      // 边框
      this.badge.circle(0, 0, 10);
      this.badge.stroke({ width: 2, color: 0xffffff });
    }
  }
}
