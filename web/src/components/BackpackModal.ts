import { Container, Graphics, Text, Application } from "pixi.js";
import { ItemCard } from "./ItemCard";
import { playClick } from "@/audio/click";

export interface ItemData {
  id: string;
  icon: string;
  name: string;
  description: string;
  count: number;
}

export interface BackpackModalOptions {
  app: Application;
  items: ItemData[];
  disabled?: boolean;
  onUseItem: (itemId: string) => void;
  onClose: () => void;
}

/**
 * 背包模态框组件
 * 全屏半透明遮罩 + 居中面板 + 道具列表
 */
export class BackpackModal extends Container {
  private overlay: Graphics;
  private panel: Graphics;
  private itemCards: ItemCard[] = [];
  private opts: BackpackModalOptions;

  constructor(opts: BackpackModalOptions) {
    super();
    this.opts = opts;

    const { width, height } = opts.app.screen;

    // 半透明遮罩
    this.overlay = new Graphics();
    this.overlay.rect(0, 0, width, height);
    this.overlay.fill({ color: 0x000000, alpha: 0.8 });
    this.overlay.eventMode = "static";
    this.overlay.on("pointerdown", () => {
      playClick();
      opts.onClose();
    });
    this.addChild(this.overlay);

    // 面板
    const panelWidth = 350;
    const panelHeight = Math.min(500, height - 100);
    this.panel = new Graphics();
    this.panel.roundRect(0, 0, panelWidth, panelHeight, 16);
    this.panel.fill({ color: 0x1a2a3a });
    this.panel.stroke({ color: 0x00ffcc, width: 3 });
    this.panel.position.set(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2);
    this.panel.eventMode = "static"; // 阻止点击穿透
    this.addChild(this.panel);

    // 标题
    const title = new Text({
      text: "🎒 道具背包",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 24,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(width / 2, height / 2 - panelHeight / 2 + 20);
    this.addChild(title);

    // 关闭按钮
    const closeButton = new Graphics();
    closeButton.circle(0, 0, 18);
    closeButton.fill({ color: 0xff4444 });
    closeButton.stroke({ color: 0xffffff, width: 2 });
    closeButton.position.set(width / 2 + panelWidth / 2 - 30, height / 2 - panelHeight / 2 + 30);
    closeButton.eventMode = "static";
    closeButton.cursor = "pointer";
    closeButton.on("pointerdown", () => {
      playClick();
      opts.onClose();
    });
    this.addChild(closeButton);

    const closeText = new Text({
      text: "✕",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 20,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    closeText.anchor.set(0.5);
    closeText.position.set(width / 2 + panelWidth / 2 - 30, height / 2 - panelHeight / 2 + 30);
    this.addChild(closeText);

    // 道具列表容器
    const itemListY = height / 2 - panelHeight / 2 + 70;
    const itemListHeight = panelHeight - 90;

    if (opts.items.length === 0) {
      const emptyText = new Text({
        text: "背包空空如也",
        style: {
          fontFamily: "Arial, sans-serif",
          fontSize: 16,
          fill: 0x888888,
        },
      });
      emptyText.anchor.set(0.5);
      emptyText.position.set(width / 2, itemListY + itemListHeight / 2);
      this.addChild(emptyText);
    } else {
      // 创建道具卡片列表
      opts.items.forEach((item, index) => {
        const card = new ItemCard({
          itemId: item.id,
          icon: item.icon,
          name: item.name,
          description: item.description,
          count: item.count,
          disabled: opts.disabled,
          onClick: (itemId) => {
            opts.onUseItem(itemId);
          },
        });
        card.position.set(width / 2 - 160, itemListY + index * 80);
        this.addChild(card);
        this.itemCards.push(card);
      });
    }
  }

  /**
   * 更新道具数量
   */
  updateItemCount(itemId: string, count: number): void {
    const card = this.itemCards.find((c) => (c as any).opts.itemId === itemId);
    if (card) {
      card.updateCount(count);
    }
  }

  /**
   * 更新禁用状态
   */
  setDisabled(disabled: boolean): void {
    this.opts.disabled = disabled;
    this.itemCards.forEach((card) => card.setDisabled(disabled));
  }
}
