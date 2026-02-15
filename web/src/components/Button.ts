import { Container, Graphics, Rectangle, Text } from "pixi.js";

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
}

export class Button extends Container {
  private bg: Graphics;
  private labelText: Text;
  private fillColor: number;
  private fillHover: number;
  private _w: number;
  private _h: number;

  constructor(opts: ButtonOptions) {
    super();
    this.fillColor = opts.fillColor ?? 0x1a2332;
    this.fillHover = opts.fillHover ?? 0x243447;
    this.eventMode = "static";
    this.cursor = "pointer";

    const fontSize = opts.fontSize ?? 20;
    this.labelText = new Text({
      text: opts.label,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize,
        fill: 0x00ffcc,
      },
    });
    this.labelText.anchor.set(0.5);
    this._w = opts.width ?? this.labelText.width + PAD_X * 2;
    this._h = opts.height ?? this.labelText.height + PAD_Y * 2;

    this.bg = new Graphics();
    this._drawBg(this.fillColor);
    this.bg.x = -this._w / 2;
    this.bg.y = -this._h / 2;
    this.addChild(this.bg);

    this.labelText.x = 0;
    this.labelText.y = 0;
    this.addChild(this.labelText);

    this.hitArea = new Rectangle(-this._w / 2, -this._h / 2, this._w, this._h);

    this.on("pointerdown", opts.onClick);
    this.on("pointerover", () => this._drawBg(this.fillHover));
    this.on("pointerout", () => this._drawBg(this.fillColor));
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

  private _drawBg(color: number): void {
    this.bg.clear();
    this.bg.roundRect(0, 0, this._w, this._h, RADIUS).fill({ color });
  }
}
