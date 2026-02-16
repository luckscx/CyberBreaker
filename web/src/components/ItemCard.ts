import { Container, Graphics, Text } from "pixi.js";
import { playClick } from "@/audio/click";

export interface ItemCardOptions {
  itemId: string;
  icon: string;
  name: string;
  description: string;
  count: number;
  disabled?: boolean;
  onClick: (itemId: string) => void;
}

/**
 * 道具卡片组件
 * 水平布局：icon - 名称/描述 - 数量 - 使用按钮
 */
export class ItemCard extends Container {
  private bg: Graphics;
  private iconText: Text;
  private nameText: Text;
  private descText: Text;
  private countText: Text;
  private useButton: Container;
  private useButtonBg: Graphics;
  private useButtonText: Text;
  private opts: ItemCardOptions;

  constructor(opts: ItemCardOptions) {
    super();
    this.opts = opts;

    const width = 320;
    const height = 70;

    // 背景
    this.bg = new Graphics();
    this._drawBackground(false);
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
    this.iconText.position.set(35, height / 2);
    this.addChild(this.iconText);

    // 名称
    this.nameText = new Text({
      text: opts.name,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 14,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    this.nameText.position.set(65, 12);
    this.addChild(this.nameText);

    // 描述
    this.descText = new Text({
      text: opts.description,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fill: 0xaaaaaa,
      },
    });
    this.descText.position.set(65, 35);
    this.addChild(this.descText);

    // 数量徽章
    this.countText = new Text({
      text: `x${opts.count}`,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 16,
        fill: 0xffa500,
        fontWeight: "bold",
      },
    });
    this.countText.anchor.set(0.5);
    this.countText.position.set(width - 85, height / 2);
    this.addChild(this.countText);

    // 使用按钮
    this.useButton = new Container();
    this.useButton.position.set(width - 60, height / 2 - 15);

    this.useButtonBg = new Graphics();
    this.useButton.addChild(this.useButtonBg);

    this.useButtonText = new Text({
      text: "使用",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 12,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    this.useButtonText.anchor.set(0.5);
    this.useButtonText.position.set(25, 15);
    this.useButton.addChild(this.useButtonText);

    this.addChild(this.useButton);

    // 交互
    this._updateInteractivity();
  }

  updateCount(count: number): void {
    this.opts.count = count;
    this.countText.text = `x${count}`;
    this._updateInteractivity();
  }

  setDisabled(disabled: boolean): void {
    this.opts.disabled = disabled;
    this._updateInteractivity();
  }

  private _updateInteractivity(): void {
    const canUse = !this.opts.disabled && this.opts.count > 0;

    if (canUse) {
      this.useButton.eventMode = "static";
      this.useButton.cursor = "pointer";
      this.useButton.alpha = 1;

      this.useButton.removeAllListeners();

      this.useButton.on("pointerdown", () => {
        playClick();
        this.useButton.scale.set(0.95);
        this.opts.onClick(this.opts.itemId);
      });

      this.useButton.on("pointerup", () => {
        this.useButton.scale.set(1);
      });

      this.useButton.on("pointerover", () => {
        this._drawUseButton(true);
      });

      this.useButton.on("pointerout", () => {
        this._drawUseButton(false);
        this.useButton.scale.set(1);
      });

      this._drawUseButton(false);
    } else {
      this.useButton.eventMode = "none";
      this.useButton.cursor = "default";
      this.useButton.alpha = 0.5;
      this.useButton.removeAllListeners();
      this._drawUseButton(false);
    }
  }

  private _drawBackground(hover: boolean): void {
    this.bg.clear();
    this.bg.roundRect(0, 0, 320, 70, 8);
    this.bg.fill({
      color: hover ? 0x2a3a4a : 0x1a2332,
      alpha: 0.9,
    });
    this.bg.roundRect(0, 0, 320, 70, 8);
    this.bg.stroke({
      width: 2,
      color: 0x00ffcc,
      alpha: 0.3,
    });
  }

  private _drawUseButton(hover: boolean): void {
    this.useButtonBg.clear();
    this.useButtonBg.roundRect(0, 0, 50, 30, 6);
    this.useButtonBg.fill({
      color: hover ? 0x00ddff : 0x00aaff,
    });
    this.useButtonBg.roundRect(0, 0, 50, 30, 6);
    this.useButtonBg.stroke({
      width: 2,
      color: 0xffffff,
      alpha: hover ? 1 : 0.5,
    });
  }
}
