import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { Background } from "@/components/Background";
import { MusicToggle } from "@/components/MusicToggle";
import { BackButton } from "@/components/BackButton";
import type { ItemType } from "@/types/itemTypes";
import { ALL_ITEM_TYPES } from "@/types/itemTypes";

export interface ItemTypeSelectSceneOptions {
  onBack: () => void;
  onSelect: (itemType: ItemType) => void;
}

export class ItemTypeSelectScene extends Container {
  private bg: Background;

  constructor(private app: Application, opts: ItemTypeSelectSceneOptions) {
    super();

    // Add animated background
    this.bg = new Background({
      width: app.screen.width,
      height: app.screen.height,
      particleCount: 25,
    });
    this.addChild(this.bg);

    const w = app.screen.width;
    const cx = w / 2;

    const top = 12;
    const backButton = new BackButton({
      x: 12,
      y: 12,
      onClick: () => opts.onBack(),
    });
    this.addChild(backButton);

    const toggleSize = 44;
    const musicToggle = new MusicToggle({
      x: w - 12 - toggleSize,
      y: 12,
    });
    this.addChild(musicToggle);

    const title = new Text({
      text: "选择物品类型",
      style: { fontFamily: "system-ui", fontSize: 24, fill: 0x00ffcc, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = top + 32;
    this.addChild(title);

    const subtitle = new Text({
      text: "Choose your game items",
      style: {
        fontFamily: "system-ui",
        fontSize: 12,
        fill: 0x99aabb,
        align: "center",
      },
    });
    subtitle.anchor.set(0.5, 0);
    subtitle.x = cx;
    subtitle.y = top + 60;
    this.addChild(subtitle);

    // Item type cards
    const cardsStartY = top + 100;
    const cardGap = 20;
    const buttonWidth = Math.min(280, w - 60);

    ALL_ITEM_TYPES.forEach((itemType, index) => {
      const cardY = cardsStartY + index * (80 + cardGap);

      // Card container
      const card = new Container();
      card.x = cx;
      card.y = cardY;

      // Card background with 3D effect
      const bg = new Graphics();
      bg.roundRect(-buttonWidth / 2, -35, buttonWidth, 70, 12)
        .fill({ color: 0x1a2636 });
      bg.roundRect(-buttonWidth / 2, -35, buttonWidth, 70, 12)
        .stroke({ width: 2, color: 0x334455 });
      card.addChild(bg);

      // Item preview (show first 4 items)
      const previewContainer = new Container();
      const previewItems = itemType.items.slice(0, 4);
      previewItems.forEach((item, i) => {
        const itemText = new Text({
          text: item,
          style: { fontSize: itemType.ui.fontSize, fill: 0x00ffcc },
        });
        itemText.anchor.set(0.5);
        itemText.x = -buttonWidth / 2 + 50 + i * 35;
        itemText.y = -10;
        previewContainer.addChild(itemText);
      });
      card.addChild(previewContainer);

      // Item name
      const nameText = new Text({
        text: itemType.name,
        style: { fontFamily: "system-ui", fontSize: 18, fill: 0xffffff, fontWeight: "bold" },
      });
      nameText.anchor.set(0, 0.5);
      nameText.x = -buttonWidth / 2 + 20;
      nameText.y = 15;
      card.addChild(nameText);

      // Item count info
      const infoText = new Text({
        text: `${itemType.items.length} 种物品`,
        style: { fontFamily: "system-ui", fontSize: 11, fill: 0x99aabb },
      });
      infoText.anchor.set(0, 0.5);
      infoText.x = -buttonWidth / 2 + 20;
      infoText.y = 30;
      card.addChild(infoText);

      // Select button
      const selectBtn = new Button({
        label: "选择",
        width: 70,
        height: 32,
        fontSize: 13,
        onClick: () => opts.onSelect(itemType),
      });
      selectBtn.x = buttonWidth / 2 - 50;
      selectBtn.y = 0;
      card.addChild(selectBtn);

      // Hover effect
      card.eventMode = "static";
      card.cursor = "pointer";
      card.on("pointerover", () => {
        bg.tint = 0xaaccff;
      });
      card.on("pointerout", () => {
        bg.tint = 0xffffff;
      });
      card.on("pointerdown", () => {
        opts.onSelect(itemType);
      });

      this.addChild(card);
    });

    // Start animation
    this.app.ticker.add(this._animate, this);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.app.ticker.remove(this._animate, this);
    super.destroy(options);
  }

  private _animate = (): void => {
    this.bg.animate();
  };
}
