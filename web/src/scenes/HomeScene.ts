import type { Application } from "pixi.js";
import { Assets, Container, Sprite, Text } from "pixi.js";
import { Button } from "@/components/Button";
import type { GameMode } from "@/types";

const TITLE_Y = 0.28;
const BUTTON_GAP = 20;
const BUTTON_START_Y = 0.42;

export interface HomeSceneOptions {
  onModeSelect: (mode: GameMode) => void;
}

export class HomeScene extends Container {
  constructor(
    private app: Application,
    private opts: HomeSceneOptions
  ) {
    super();
    this._loadCoverBg();
    this.addChild(this._buildTitle());
    this._addButtons();
  }

  private _loadCoverBg(): void {
    Assets.load("/cover-bg.jpeg").then((texture) => {
      const bg = new Sprite(texture);
      const w = this.app.screen.width;
      const h = this.app.screen.height;
      const scale = Math.max(w / texture.width, h / texture.height);
      bg.scale.set(scale);
      bg.anchor.set(0.5);
      bg.x = w / 2;
      bg.y = h / 2;
      this.addChildAt(bg, 0);
    });
  }

  private _buildTitle(): Text {
    const t = new Text({
      text: "潜行解码",
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 42,
        fill: 0x00ffcc,
      },
    });
    t.anchor.set(0.5);
    t.x = this.app.screen.width / 2;
    t.y = this.app.screen.height * TITLE_Y;
    return t;
  }

  private _addButtons(): void {
    const cx = this.app.screen.width / 2;
    const baseY = this.app.screen.height * BUTTON_START_Y;

    const single = new Button({
      label: "单机模式",
      width: 200,
      onClick: () => this.opts.onModeSelect("single"),
    });
    single.x = cx;
    single.y = baseY;
    this.addChild(single);

    const room = new Button({
      label: "创建房间",
      width: 200,
      onClick: () => this.opts.onModeSelect("room"),
    });
    room.x = cx;
    room.y = baseY + single.height + BUTTON_GAP;
    this.addChild(room);
  }
}
