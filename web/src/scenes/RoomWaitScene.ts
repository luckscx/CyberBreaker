import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { playClick } from "@/audio/click";
import { RoomClient, type RoomRole } from "@/room/client";
import { isValidGuess } from "@/logic/guess";

const SLOT_SIZE = 48;
const SLOT_GAP = 10;
const KEY_SIZE = 48;
const KEY_GAP = 8;
const KEYPAD_COLS = 4;
const KEYPAD_ROWS = 3;
const KEYPAD_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const RADIUS = 8;

export interface RoomWaitSceneOptions {
  app: Application;
  client: RoomClient;
  roomId: string;
  role: RoomRole;
  joinUrl?: string;
  onGameStart: (turn: RoomRole, turnStartAt: number) => void;
  onBack: () => void;
}

const CIRCLE_R = 14;
const CIRCLE_GAP = 48;

export class RoomWaitScene extends Container {
  private statusText: Text;
  private codeContainer: Container;
  private codeSlots: Container;
  private codeValue = "";
  private digitButtons: Button[] = [];
  private client: RoomClient;
  private unsub: (() => void) | null = null;
  private myCircle: Graphics;
  private peerCircle: Graphics;
  private myLabel: Text;
  private peerLabel: Text;
  private role: RoomRole;
  private myCodeSet = false;
  private peerCodeSet = false;
  private shareBar: Container | null = null;

  constructor(private opts: RoomWaitSceneOptions) {
    super();
    const { app, client, role, joinUrl, onBack } = opts;
    this.client = client;
    this.role = role;
    const w = app.screen.width;
    const cx = w / 2;

    if (joinUrl && role === "host") {
      this.shareBar = this._buildShareBar(app, joinUrl);
      this.addChild(this.shareBar);
    }

    const back = new Button({
      label: "返回",
      width: 72,
      onClick: () => {
        playClick();
        onBack();
      },
    });
    back.x = 60;
    back.y = 50;
    this.addChild(back);

    this.statusText = new Text({
      text: "连接中...",
      style: { fontFamily: "system-ui", fontSize: 18, fill: 0xaaaaaa },
    });
    this.statusText.anchor.set(0.5);
    this.statusText.x = cx;
    this.statusText.y = 100;
    this.addChild(this.statusText);

    const statusY = 135;
    this.myCircle = this._drawCircle(false);
    this.myCircle.x = cx - CIRCLE_GAP;
    this.myCircle.y = statusY;
    this.addChild(this.myCircle);
    this.myLabel = new Text({
      text: "我方",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x888888 },
    });
    this.myLabel.anchor.set(0.5, 0);
    this.myLabel.x = cx - CIRCLE_GAP;
    this.myLabel.y = statusY + CIRCLE_R + 4;
    this.addChild(this.myLabel);

    this.peerCircle = this._drawCircle(false);
    this.peerCircle.x = cx + CIRCLE_GAP;
    this.peerCircle.y = statusY;
    this.addChild(this.peerCircle);
    this.peerLabel = new Text({
      text: "对方",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x888888 },
    });
    this.peerLabel.anchor.set(0.5, 0);
    this.peerLabel.x = cx + CIRCLE_GAP;
    this.peerLabel.y = statusY + CIRCLE_R + 4;
    this.addChild(this.peerLabel);

    this.codeContainer = new Container();
    this.codeContainer.visible = false;
    this.codeContainer.y = 185;

    const hint = new Text({
      text: "设置你的 4 位密码（对方要猜的数字）",
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0x888888 },
    });
    hint.anchor.set(0.5);
    hint.x = cx;
    hint.y = 0;
    this.codeContainer.addChild(hint);

    this.codeSlots = this._buildCodeSlots();
    this.codeSlots.x = cx - (4 * SLOT_SIZE + 3 * SLOT_GAP) / 2 + SLOT_SIZE / 2 + SLOT_GAP / 2;
    this.codeSlots.y = 35;
    this.codeContainer.addChild(this.codeSlots);

    const keypadW = KEYPAD_COLS * KEY_SIZE + (KEYPAD_COLS - 1) * KEY_GAP;
    KEYPAD_DIGITS.forEach((digit, i) => {
      const row = Math.floor(i / KEYPAD_COLS);
      const col = i % KEYPAD_COLS;
      const btn = new Button({
        label: String(digit),
        width: KEY_SIZE,
        height: KEY_SIZE,
        fontSize: 20,
        fillColor: 0x1a2636,
        fillHover: 0x2a3648,
        onClick: () => {
          playClick();
          this._addDigit(digit);
        },
      });
      btn.x = cx - keypadW / 2 + KEY_SIZE / 2 + col * (KEY_SIZE + KEY_GAP);
      btn.y = 100 + row * (KEY_SIZE + KEY_GAP);
      this.codeContainer.addChild(btn);
      this.digitButtons.push(btn);
    });

    const confirmBtn = new Button({
      label: "确认密码",
      width: 120,
      onClick: () => {
        playClick();
        this._submitCode();
      },
    });
    confirmBtn.x = cx;
    confirmBtn.y = 100 + KEYPAD_ROWS * (KEY_SIZE + KEY_GAP) + 12;
    this.codeContainer.addChild(confirmBtn);

    this.addChild(this.codeContainer);

    this.unsub = this.client.onMessage((msg) => this._onMsg(msg));
    this.statusText.text = role === "host" ? "等待对方加入..." : "已加入房间，等待房主...";
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.unsub?.();
    super.destroy(options);
  }

  private _applyCodeState(hostCodeSet: boolean, guestCodeSet: boolean): void {
    this.myCodeSet = this.role === "host" ? hostCodeSet : guestCodeSet;
    this.peerCodeSet = this.role === "host" ? guestCodeSet : hostCodeSet;
    const drawOne = (g: Graphics, filled: boolean) => {
      g.clear();
      const color = filled ? 0x00cc88 : 0x1a2332;
      g.circle(0, 0, CIRCLE_R).fill({ color });
      g.circle(0, 0, CIRCLE_R).stroke({ width: 1, color: filled ? 0x00cc88 : 0x334455 });
    };
    drawOne(this.myCircle, this.myCodeSet);
    drawOne(this.peerCircle, this.peerCodeSet);
  }

  private _onMsg(msg: { type: string; turn?: RoomRole; turnStartAt?: number; hostCodeSet?: boolean; guestCodeSet?: boolean; error?: string; message?: string }): void {
    if (msg.type === "room_joined") {
      if (msg.hostCodeSet !== undefined && msg.guestCodeSet !== undefined) {
        this._applyCodeState(msg.hostCodeSet, msg.guestCodeSet);
      }
    }
    if (msg.type === "peer_joined") {
      this.statusText.style.fill = 0xaaaaaa;
      this.statusText.text = "对方已加入！请设置你的 4 位密码";
      this.codeContainer.visible = true;
      if (this.shareBar && this.role === "host") this.shareBar.visible = false;
    }
    if (msg.type === "game_start" && msg.message) {
      this.statusText.style.fill = 0xaaaaaa;
      this.statusText.text = "请设置你的 4 位密码（对方要猜的数字）";
      this.codeContainer.visible = true;
    }
    if (msg.type === "code_state") {
      if (msg.hostCodeSet !== undefined && msg.guestCodeSet !== undefined) {
        this._applyCodeState(msg.hostCodeSet, msg.guestCodeSet);
      }
    }
    if (msg.type === "code_set") {
      this.statusText.style.fill = 0xaaaaaa;
      this.statusText.text = "已设置，等待对方确认...";
      this.codeContainer.visible = false;
    }
    if (msg.type === "game_start" && msg.turn !== undefined) {
      this.opts.onGameStart(msg.turn, msg.turnStartAt ?? Date.now());
    }
    if (msg.type === "error") {
      this.statusText.text = msg.error ?? "错误";
      this.statusText.style.fill = 0xff6644;
    }
  }

  private _buildShareBar(app: import("pixi.js").Application, joinUrl: string): Container {
    const w = app.screen.width;
    const h = app.screen.height;
    const cx = w / 2;
    const bar = new Container();
    bar.x = cx;
    bar.y = h / 2 - 50;

    const boxW = Math.min(w - 80, 320);
    const padding = 20;
    const bg = new Graphics();
    bg.roundRect(-boxW / 2, 0, boxW, 140, 12).fill({ color: 0x0d1520, alpha: 0.95 });
    bg.roundRect(-boxW / 2, 0, boxW, 140, 12).stroke({ width: 1, color: 0x334455 });
    bar.addChild(bg);

    const hint = new Text({
      text: "邀请链接（人数未满可分享）",
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0x888888 },
    });
    hint.anchor.set(0.5);
    hint.x = 0;
    hint.y = 28;
    bar.addChild(hint);

    const linkText = new Text({
      text: joinUrl,
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0xaaaaaa, wordWrap: true, wordWrapWidth: boxW - padding * 2 },
    });
    linkText.anchor.set(0.5, 0);
    linkText.x = 0;
    linkText.y = 52;
    bar.addChild(linkText);

    const copyBtn = new Button({
      label: "复制链接",
      width: 120,
      fontSize: 14,
      onClick: () => {
        playClick();
        navigator.clipboard.writeText(joinUrl).then(
          () => {
            copyBtn.setLabel("已复制");
            setTimeout(() => copyBtn.setLabel("复制链接"), 1500);
          },
          () => {
            copyBtn.setLabel("复制失败");
            setTimeout(() => copyBtn.setLabel("复制链接"), 1500);
          }
        );
      },
    });
    copyBtn.x = -copyBtn.width / 2;
    copyBtn.y = 95;
    bar.addChild(copyBtn);
    return bar;
  }

  private _drawCircle(filled: boolean): Graphics {
    const g = new Graphics();
    const color = filled ? 0x00cc88 : 0x1a2332;
    g.circle(0, 0, CIRCLE_R).fill({ color });
    g.circle(0, 0, CIRCLE_R).stroke({ width: 1, color: filled ? 0x00cc88 : 0x334455 });
    return g;
  }

  private _buildCodeSlots(): Container {
    const c = new Container();
    for (let i = 0; i < 4; i++) {
      const box = new Graphics();
      box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).fill({ color: 0x1a2332 });
      box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).stroke({ width: 1, color: 0x334455 });
      box.x = i * (SLOT_SIZE + SLOT_GAP);
      c.addChild(box);
      const text = new Text({
        text: "?",
        style: { fontFamily: "system-ui", fontSize: 22, fill: 0x00ffcc },
      });
      text.anchor.set(0.5);
      text.x = i * (SLOT_SIZE + SLOT_GAP);
      text.name = `slot-${i}`;
      c.addChild(text);
    }
    return c;
  }

  private _refreshSlots(): void {
    const digits = this.codeValue.split("");
    for (let i = 0; i < 4; i++) {
      const t = this.codeSlots.getChildByName(`slot-${i}`) as Text;
      if (t) t.text = digits[i] ?? "?";
    }
    this.digitButtons.forEach((btn, i) => {
      btn.visible = !this.codeValue.includes(String(KEYPAD_DIGITS[i]));
    });
  }

  private _addDigit(d: number): void {
    if (this.codeValue.length >= 4 || this.codeValue.includes(String(d))) return;
    this.codeValue += d;
    this._refreshSlots();
  }

  private _submitCode(): void {
    if (!isValidGuess(this.codeValue)) {
      this.statusText.text = "请输入 4 位不重复数字";
      this.statusText.style.fill = 0xffaa44;
      return;
    }
    if (!this.client.connected) {
      this.statusText.text = "未连接，请重试";
      this.statusText.style.fill = 0xff6644;
      return;
    }
    this.statusText.style.fill = 0xaaaaaa;
    this.client.setCode(this.codeValue);
  }
}
