import { Container, Graphics, Text } from "pixi.js";
import { playClick } from "@/audio/click";

export interface PowerUpButtonOptions {
  icon: string;
  name: string;
  count: number;
  disabled?: boolean;
  onClick: () => void;
}

export class PowerUpButton extends Container {
  private bg: Graphics;
  private iconText: Text;
  private nameText: Text;
  private countBadge: Container;
  private countText: Text;
  private opts: PowerUpButtonOptions;

  constructor(opts: PowerUpButtonOptions) {
    super();
    this.opts = opts;

    const width = 70;
    const height = 90;

    // 背景
    this.bg = new Graphics();
    this.bg
      .roundRect(0, 0, width, height, 8)
      .fill({ color: opts.disabled ? 0x555555 : 0x2a4a6a });
    this.bg
      .roundRect(0, 0, width, height, 8)
      .stroke({ color: 0x00aaff, width: 2 });
    this.addChild(this.bg);

    // 图标
    this.iconText = new Text({
      text: opts.icon,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 32,
      },
    });
    this.iconText.anchor.set(0.5);
    this.iconText.position.set(width / 2, 30);
    this.addChild(this.iconText);

    // 名称
    this.nameText = new Text({
      text: opts.name,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 10,
        fill: 0xcccccc,
      },
    });
    this.nameText.anchor.set(0.5);
    this.nameText.position.set(width / 2, height - 15);
    this.addChild(this.nameText);

    // 数量徽章
    this.countBadge = new Container();
    const badge = new Graphics();
    badge.circle(0, 0, 12).fill({ color: 0xff6600 });
    this.countBadge.addChild(badge);

    this.countText = new Text({
      text: `${opts.count}`,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 12,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    this.countText.anchor.set(0.5);
    this.countBadge.addChild(this.countText);
    this.countBadge.position.set(width - 10, 10);
    this.addChild(this.countBadge);

    // 交互
    if (!opts.disabled && opts.count > 0) {
      this.interactive = true;
      this.cursor = "pointer";

      this.on("pointerdown", () => {
        playClick();
        this.scale.set(0.95);
        opts.onClick();
      });

      this.on("pointerup", () => {
        this.scale.set(1);
      });

      this.on("pointerover", () => {
        this.bg.clear();
        this.bg
          .roundRect(0, 0, width, height, 8)
          .fill({ color: 0x3a5a8a });
        this.bg
          .roundRect(0, 0, width, height, 8)
          .stroke({ color: 0x00ddff, width: 3 });
      });

      this.on("pointerout", () => {
        this.bg.clear();
        this.bg
          .roundRect(0, 0, width, height, 8)
          .fill({ color: 0x2a4a6a });
        this.bg
          .roundRect(0, 0, width, height, 8)
          .stroke({ color: 0x00aaff, width: 2 });
        this.scale.set(1);
      });
    } else {
      this.alpha = 0.5;
    }
  }

  updateCount(count: number): void {
    this.opts.count = count;
    this.countText.text = `${count}`;

    if (count === 0) {
      this.interactive = false;
      this.cursor = "default";
      this.alpha = 0.5;
    }
  }

  setDisabled(disabled: boolean): void {
    this.opts.disabled = disabled;
    this.interactive = !disabled && this.opts.count > 0;
    this.cursor = disabled || this.opts.count === 0 ? "default" : "pointer";
    this.alpha = disabled || this.opts.count === 0 ? 0.5 : 1;

    this.bg.clear();
    this.bg
      .roundRect(0, 0, 70, 90, 8)
      .fill({ color: disabled ? 0x555555 : 0x2a4a6a });
    this.bg
      .roundRect(0, 0, 70, 90, 8)
      .stroke({ color: 0x00aaff, width: 2 });
  }
}
