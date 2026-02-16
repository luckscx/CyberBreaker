import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { BackButton } from "@/components/BackButton";
import { MusicToggle } from "@/components/MusicToggle";
import { Background } from "@/components/Background";
import { playClick } from "@/audio/click";
import { createFreeRoom, getFreeRoom } from "@/api/freeRoom";

export interface FreeGuessHomeOptions {
  app: Application;
  onBack: () => void;
  onEnterRoom: (roomCode: string, isHost: boolean, password?: string) => void;
}

export class FreeGuessHome extends Container {
  private app: Application;
  private statusText: Text;
  private inputEl: HTMLInputElement | null = null;
  private limitInputEl: HTMLInputElement | null = null;
  private passwordInputEl: HTMLInputElement | null = null;

  constructor(private opts: FreeGuessHomeOptions) {
    super();
    this.app = opts.app;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const cx = w / 2;

    const bg = new Background({ width: w, height: h, particleCount: 20 });
    this.addChild(bg);
    this.app.ticker.add(() => bg.animate());

    const back = new BackButton({ x: 16 + 24, y: 16 + 24, onClick: () => { playClick(); this._cleanup(); opts.onBack(); } });
    this.addChild(back);

    const music = new MusicToggle({ x: w - 16 - 24, y: 16 + 24 });
    this.addChild(music);

    const title = new Text({
      text: "多人猜数房间",
      style: { fontFamily: "system-ui", fontSize: 24, fill: 0x00ffcc, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.x = cx; title.y = h * 0.12;
    this.addChild(title);

    const subtitle = new Text({
      text: "2-8人同房间，自由猜数，抢先破解！",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x99aabb },
    });
    subtitle.anchor.set(0.5);
    subtitle.x = cx; subtitle.y = h * 0.17;
    this.addChild(subtitle);

    // --- Create Section ---
    const sectionY1 = h * 0.24;
    const cardW = Math.min(280, w - 40);

    const createCard = new Graphics();
    createCard.roundRect(cx - cardW / 2, sectionY1, cardW, 170, 12).fill({ color: 0x0d1520, alpha: 0.95 });
    createCard.roundRect(cx - cardW / 2, sectionY1, cardW, 170, 12).stroke({ width: 1, color: 0x334455 });
    this.addChild(createCard);

    const createLabel = new Text({
      text: "创建房间",
      style: { fontFamily: "system-ui", fontSize: 16, fill: 0x00ffcc, fontWeight: "bold" },
    });
    createLabel.anchor.set(0.5);
    createLabel.x = cx; createLabel.y = sectionY1 + 20;
    this.addChild(createLabel);

    // Guess limit
    const limitLabel = new Text({
      text: "猜数次数上限：",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x99aabb },
    });
    limitLabel.x = cx - cardW / 2 + 16;
    limitLabel.y = sectionY1 + 44;
    this.addChild(limitLabel);

    this._createLimitInput(cx + 30, sectionY1 + 40);

    // Password
    const pwLabel = new Text({
      text: "房间密码(可选)：",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x99aabb },
    });
    pwLabel.x = cx - cardW / 2 + 16;
    pwLabel.y = sectionY1 + 76;
    this.addChild(pwLabel);

    this._createPasswordInput(cx + 30, sectionY1 + 72);

    const createBtn = new Button({
      label: "创建房间",
      width: cardW - 32,
      fontSize: 15,
      onClick: () => this._createRoom(),
    });
    createBtn.x = cx;
    createBtn.y = sectionY1 + 130;
    this.addChild(createBtn);

    // --- Join Section ---
    const sectionY2 = sectionY1 + 190;

    const joinCard = new Graphics();
    joinCard.roundRect(cx - cardW / 2, sectionY2, cardW, 130, 12).fill({ color: 0x0d1520, alpha: 0.95 });
    joinCard.roundRect(cx - cardW / 2, sectionY2, cardW, 130, 12).stroke({ width: 1, color: 0x334455 });
    this.addChild(joinCard);

    const joinLabel = new Text({
      text: "加入房间",
      style: { fontFamily: "system-ui", fontSize: 16, fill: 0x00ffcc, fontWeight: "bold" },
    });
    joinLabel.anchor.set(0.5);
    joinLabel.x = cx; joinLabel.y = sectionY2 + 20;
    this.addChild(joinLabel);

    const codeLabel = new Text({
      text: "输入6位房间码：",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0x99aabb },
    });
    codeLabel.x = cx - cardW / 2 + 16;
    codeLabel.y = sectionY2 + 48;
    this.addChild(codeLabel);

    this._createRoomCodeInput(cx + 30, sectionY2 + 44);

    const joinBtn = new Button({
      label: "加入房间",
      width: cardW - 32,
      fontSize: 15,
      onClick: () => this._joinRoom(),
    });
    joinBtn.x = cx;
    joinBtn.y = sectionY2 + 95;
    this.addChild(joinBtn);

    // Status
    this.statusText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 13, fill: 0xff6644 },
    });
    this.statusText.anchor.set(0.5);
    this.statusText.x = cx;
    this.statusText.y = sectionY2 + 145;
    this.addChild(this.statusText);
  }

  private _createLimitInput(x: number, y: number): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.app.screen.width;
    const scaleY = rect.height / this.app.screen.height;

    const input = document.createElement("input");
    input.type = "number";
    input.value = "10";
    input.min = "3";
    input.max = "30";
    input.style.cssText = `position:fixed;width:60px;height:28px;font-size:14px;text-align:center;border:1px solid #334455;border-radius:6px;background:#0d1520;color:#00ffcc;outline:none;z-index:100;`;
    input.style.left = `${rect.left + x * scaleX}px`;
    input.style.top = `${rect.top + y * scaleY}px`;
    document.body.appendChild(input);
    this.limitInputEl = input;
  }

  private _createPasswordInput(x: number, y: number): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.app.screen.width;
    const scaleY = rect.height / this.app.screen.height;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "无密码";
    input.maxLength = 10;
    input.style.cssText = `position:fixed;width:100px;height:28px;font-size:14px;text-align:center;border:1px solid #334455;border-radius:6px;background:#0d1520;color:#00ffcc;outline:none;z-index:100;`;
    input.style.left = `${rect.left + x * scaleX}px`;
    input.style.top = `${rect.top + y * scaleY}px`;
    document.body.appendChild(input);
    this.passwordInputEl = input;
  }

  private _createRoomCodeInput(x: number, y: number): void {
    const canvas = this.app.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / this.app.screen.width;
    const scaleY = rect.height / this.app.screen.height;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "000000";
    input.maxLength = 6;
    input.inputMode = "numeric";
    input.pattern = "\\d{6}";
    input.style.cssText = `position:fixed;width:120px;height:28px;font-size:16px;text-align:center;letter-spacing:4px;border:1px solid #334455;border-radius:6px;background:#0d1520;color:#00ffcc;outline:none;z-index:100;`;
    input.style.left = `${rect.left + x * scaleX}px`;
    input.style.top = `${rect.top + y * scaleY}px`;
    document.body.appendChild(input);
    this.inputEl = input;
  }

  private async _createRoom(): Promise<void> {
    this.statusText.text = "创建中...";
    this.statusText.style.fill = 0x99aabb;
    try {
      const guessLimit = Math.max(3, Math.min(30, parseInt(this.limitInputEl?.value || "10") || 10));
      const password = this.passwordInputEl?.value?.trim() || undefined;
      const data = await createFreeRoom({ guessLimit, password });
      this._cleanup();
      this.opts.onEnterRoom(data.roomCode, true, password);
    } catch (e: unknown) {
      this.statusText.text = (e as Error).message || "创建失败";
      this.statusText.style.fill = 0xff6644;
    }
  }

  private async _joinRoom(): Promise<void> {
    const code = this.inputEl?.value?.trim() || "";
    if (!/^\d{6}$/.test(code)) {
      this.statusText.text = "请输入6位数字房间码";
      this.statusText.style.fill = 0xff6644;
      return;
    }
    this.statusText.text = "查询中...";
    this.statusText.style.fill = 0x99aabb;
    try {
      const info = await getFreeRoom(code);
      if (info.state === "playing") {
        this.statusText.text = "游戏已开始，无法加入";
        this.statusText.style.fill = 0xff6644;
        return;
      }
      if (info.playerCount >= info.maxPlayers) {
        this.statusText.text = "房间已满";
        this.statusText.style.fill = 0xff6644;
        return;
      }
      this._cleanup();
      this.opts.onEnterRoom(code, false);
    } catch (e: unknown) {
      this.statusText.text = (e as Error).message || "房间不存在";
      this.statusText.style.fill = 0xff6644;
    }
  }

  private _cleanup(): void {
    this.inputEl?.remove();
    this.inputEl = null;
    this.limitInputEl?.remove();
    this.limitInputEl = null;
    this.passwordInputEl?.remove();
    this.passwordInputEl = null;
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this._cleanup();
    super.destroy(options);
  }
}
