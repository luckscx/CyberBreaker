import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { KeyButton } from "@/components/KeyButton";
import { Background } from "@/components/Background";
import { MusicToggle } from "@/components/MusicToggle";
import { BackButton } from "@/components/BackButton";
import { RoomClient, type RoomRole } from "@/room/client";
import type { RoomRule } from "@/room/client";
import { isValidGuessForRule } from "@/logic/guess";

const SLOT_SIZE = 50;
const SLOT_GAP = 8;
const KEY_SIZE = 64;
const KEY_GAP = 8;
const KEYPAD_COLS = 3;
const KEYPAD_ROWS = 4;
const KEYPAD_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const RADIUS = 8;

export interface RoomWaitSceneOptions {
  app: Application;
  client: RoomClient;
  roomId: string;
  role: RoomRole;
  joinUrl?: string;
  onGameStart: (turn: RoomRole, turnStartAt: number, rule: RoomRule, myCode: string, history?: { role: RoomRole; guess: string; result: string; timestamp: number }[]) => void;
  onBack: () => void;
}

const CIRCLE_R = 12;
const CIRCLE_GAP = 40;

export class RoomWaitScene extends Container {
  private statusText: Text;
  private codeContainer: Container;
  private codeSlots: Container;
  private codeValue = "";
  private digitButtons: KeyButton[] = [];
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
  private bg: Background;
  private app: Application;
  private rule: RoomRule = "standard";
  private ruleLabel: Text | null = null;
  private myCode = ""; // 保存自己设置的密码

  constructor(private opts: RoomWaitSceneOptions) {
    super();
    const { app, client, role, joinUrl, onBack } = opts;
    this.app = app;
    this.client = client;
    this.role = role;
    const w = app.screen.width;
    const cx = w / 2;

    // Add animated background
    this.bg = new Background({
      width: app.screen.width,
      height: app.screen.height,
      particleCount: 20,
    });
    this.addChild(this.bg);

    // Update browser URL to joinUrl for easy sharing
    if (joinUrl && typeof window !== "undefined") {
      try {
        const url = new URL(joinUrl);
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch (e) {
        console.warn("Failed to update URL:", e);
      }
    }

    if (joinUrl && role === "host") {
      this.shareBar = this._buildShareBar(app, joinUrl);
      this.addChild(this.shareBar);
    }

    const backButton = new BackButton({
      x: 16,
      y: 16,
      onClick: () => {
        onBack();
      },
    });
    this.addChild(backButton);

    const toggleSize = 48;
    const musicToggle = new MusicToggle({
      x: w - 16 - toggleSize,
      y: 16,
    });
    this.addChild(musicToggle);

    this.statusText = new Text({
      text: "连接中...",
      style: { fontFamily: "system-ui", fontSize: 16, fill: 0xaaaaaa },
    });
    this.statusText.anchor.set(0.5);
    this.statusText.x = cx;
    this.statusText.y = 85;
    this.addChild(this.statusText);

    const statusY = 115;
    this.myCircle = this._drawCircle(false);
    this.myCircle.x = cx - CIRCLE_GAP;
    this.myCircle.y = statusY;
    this.addChild(this.myCircle);
    this.myLabel = new Text({
      text: "我方",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x888888 },
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
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x888888 },
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
      style: { fontFamily: "system-ui", fontSize: 13, fill: 0x888888 },
    });
    hint.anchor.set(0.5);
    hint.x = cx;
    hint.y = 0;
    this.codeContainer.addChild(hint);

    this.ruleLabel = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x668899 },
    });
    this.ruleLabel.anchor.set(0.5);
    this.ruleLabel.x = cx;
    this.ruleLabel.y = 18;
    this.codeContainer.addChild(this.ruleLabel);

    this.codeSlots = this._buildCodeSlots();
    this.codeSlots.x = cx - (4 * SLOT_SIZE + 3 * SLOT_GAP) / 2 + SLOT_SIZE / 2 + SLOT_GAP / 2;
    this.codeSlots.y = 38;
    this.codeContainer.addChild(this.codeSlots);

    const keypadW = KEYPAD_COLS * KEY_SIZE + (KEYPAD_COLS - 1) * KEY_GAP;
    KEYPAD_DIGITS.forEach((digit, i) => {
      const row = Math.floor(i / KEYPAD_COLS);
      const col = i % KEYPAD_COLS;
      const btn = new KeyButton({
        label: String(digit),
        width: KEY_SIZE,
        height: KEY_SIZE,
        fontSize: 22,
        onClick: () => {
          this._addDigit(digit);
        },
      });
      btn.x = cx - keypadW / 2 + KEY_SIZE / 2 + col * (KEY_SIZE + KEY_GAP);
      btn.y = 98 + row * (KEY_SIZE + KEY_GAP);
      this.codeContainer.addChild(btn);
      this.digitButtons.push(btn);
    });

    const actionY = 90 + KEYPAD_ROWS * (KEY_SIZE + KEY_GAP) + 12;
    const backspaceBtn = new Button({
      label: "⌫ 退格",
      width: 90,
      fontSize: 14,
      onClick: () => {
        this._backspace();
      },
    });
    backspaceBtn.x = cx - 65;
    backspaceBtn.y = actionY;
    this.codeContainer.addChild(backspaceBtn);

    const confirmBtn = new Button({
      label: "✓ 确认",
      width: 90,
      fontSize: 14,
      onClick: () => {
        this._submitCode();
      },
    });
    confirmBtn.x = cx + 65;
    confirmBtn.y = actionY;
    this.codeContainer.addChild(confirmBtn);

    this._updateRuleLabel();

    this.addChild(this.codeContainer);

    this.unsub = this.client.onMessage((msg) => this._onMsg(msg));
    this.statusText.text = role === "host" ? "等待对方加入..." : "已加入房间，等待房主...";

    // Start animation
    this.app.ticker.add(this._animate, this);
  }

  private _animate = (): void => {
    this.bg.animate();
  };

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.unsub?.();
    this.app.ticker.remove(this._animate, this);
    super.destroy(options);
  }

  private _applyCodeState(hostCodeSet: boolean, guestCodeSet: boolean): void {
    this.myCodeSet = this.role === "host" ? hostCodeSet : guestCodeSet;
    this.peerCodeSet = this.role === "host" ? guestCodeSet : hostCodeSet;

    const animateCircle = (g: Graphics, filled: boolean) => {
      const targetColor = filled ? 0x00cc88 : 0x1a2332;
      const targetStrokeColor = filled ? 0x00cc88 : 0x334455;
      const startTime = Date.now();
      const duration = 300;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        g.clear();
        g.circle(0, 0, CIRCLE_R).fill({ color: targetColor });
        g.circle(0, 0, CIRCLE_R).stroke({
          width: 2,
          color: targetStrokeColor,
          alpha: filled ? 1 : 0.3,
        });

        if (filled) {
          const pulseScale = 1 + Math.sin(Date.now() * 0.005) * 0.1;
          g.scale.set(pulseScale);

          // Add glow effect
          const glowAlpha = 0.3 + Math.sin(Date.now() * 0.005) * 0.2;
          g.circle(0, 0, CIRCLE_R + 4).fill({
            color: 0x00cc88,
            alpha: glowAlpha * 0.3,
          });
        } else {
          g.scale.set(1);
        }

        if (progress < 1 || filled) {
          requestAnimationFrame(animate);
        }
      };

      animate();
    };

    animateCircle(this.myCircle, this.myCodeSet);
    animateCircle(this.peerCircle, this.peerCodeSet);
  }

  private _updateRuleLabel(): void {
    if (!this.ruleLabel) return;
    if (this.rule === "guess_person") {
      this.ruleLabel.text = "规则：猜人名（轮流选题，抢先猜对）";
    } else if (this.rule === "position_only") {
      this.ruleLabel.text = "规则：位置赛（数字可重复，只显示对位数）";
    } else {
      this.ruleLabel.text = "规则：标准（4位不重复 1A2B）";
    }
  }

  private _onMsg(msg: {
    type: string;
    rule?: RoomRule;
    turn?: RoomRole;
    turnStartAt?: number;
    hostCodeSet?: boolean;
    guestCodeSet?: boolean;
    error?: string;
    message?: string;
    isReconnect?: boolean;
    history?: { role: RoomRole; guess: string; result: string; timestamp: number }[];
    state?: string;
  }): void {
    if (msg.type === "room_joined") {
      if (msg.rule !== undefined) {
        this.rule = msg.rule;
        this._updateRuleLabel();
      }
      if (msg.hostCodeSet !== undefined && msg.guestCodeSet !== undefined) {
        this._applyCodeState(msg.hostCodeSet, msg.guestCodeSet);
      }
      // 处理重连：如果是重连且游戏已开始，直接进入游戏场景
      // guess_person 模式的重连由 Game.ts 处理
      if (msg.isReconnect && msg.state === "playing" && msg.turn !== undefined && this.rule !== "guess_person") {
        console.log("[RoomWaitScene] reconnecting to playing game");
        this.statusText.text = "正在重连游戏...";
        this.statusText.style.fill = 0x00ffcc;
        setTimeout(() => {
          this.opts.onGameStart(msg.turn!, msg.turnStartAt ?? Date.now(), msg.rule ?? this.rule, this.myCode, msg.history);
        }, 500); // 短暂延迟，让用户看到重连提示
      } else if (msg.isReconnect && this.rule === "guess_person") {
        this.statusText.text = "正在重连...";
        this.statusText.style.fill = 0x00ffcc;
      } else if (msg.isReconnect) {
        // 重连到等待阶段
        this.statusText.text = "已重连，等待对方加入...";
        this.statusText.style.fill = 0x00ffcc;
      }
    }
    if (msg.type === "peer_joined") {
      if (this.shareBar && this.role === "host") this.shareBar.visible = false;
      if (this.rule === "guess_person") {
        // 猜人名模式：不需要设置密码，等待服务器 gp_game_start
        this.statusText.style.fill = 0x00ffcc;
        this.statusText.text = "对方已加入，即将开始...";
      } else {
        this.statusText.style.fill = 0xaaaaaa;
        this.statusText.text = "对方已加入！请设置你的 4 位密码";
        this.codeContainer.visible = true;
      }
    }
    if (msg.type === "gp_generating") {
      this.statusText.style.fill = 0x00ffcc;
      this.statusText.text = "🤖 AI 正在出题，请稍候...";
    }
    if (msg.type === "game_start" && msg.message) {
      if (this.rule !== "guess_person") {
        this.statusText.style.fill = 0xaaaaaa;
        this.statusText.text = "请设置你的 4 位密码（对方要猜的数字）";
        this.codeContainer.visible = true;
      }
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
      this.opts.onGameStart(msg.turn, msg.turnStartAt ?? Date.now(), msg.rule ?? this.rule, this.myCode, msg.history);
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
      style: { fontFamily: "system-ui", fontSize: 13, fill: 0x888888 },
    });
    hint.anchor.set(0.5);
    hint.x = 0;
    hint.y = 24;
    bar.addChild(hint);

    const linkText = new Text({
      text: joinUrl,
      style: { fontFamily: "system-ui", fontSize: 10, fill: 0xaaaaaa, wordWrap: true, wordWrapWidth: boxW - padding * 2 },
    });
    linkText.anchor.set(0.5, 0);
    linkText.x = 0;
    linkText.y = 46;
    bar.addChild(linkText);

    const copyBtn = new Button({
      label: "复制链接",
      width: 110,
      fontSize: 13,
      onClick: () => {
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
    copyBtn.y = 86;
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
      // Glow effect
      const glow = new Graphics();
      glow.roundRect(-SLOT_SIZE / 2 - 2, -SLOT_SIZE / 2 - 2, SLOT_SIZE + 4, SLOT_SIZE + 4, RADIUS + 2).fill({
        color: 0x00ffcc,
        alpha: 0,
      });
      glow.x = i * (SLOT_SIZE + SLOT_GAP);
      glow.name = `glow-${i}`;
      c.addChild(glow);

      const box = new Graphics();
      box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).fill({ color: 0x1a2332 });
      box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).stroke({
        width: 2,
        color: 0x334455,
        alpha: 0.5,
      });
      box.x = i * (SLOT_SIZE + SLOT_GAP);
      box.name = `box-${i}`;
      c.addChild(box);

      const text = new Text({
        text: "?",
        style: {
          fontFamily: "system-ui",
          fontSize: 20,
          fill: 0x00ffcc,
          dropShadow: {
            color: 0x00ffcc,
            blur: 4,
            alpha: 0.3,
            distance: 0,
          },
        },
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
      const box = this.codeSlots.getChildByName(`box-${i}`) as Graphics;
      const glow = this.codeSlots.getChildByName(`glow-${i}`) as Graphics;

      if (t) t.text = digits[i] ?? "?";

      // Highlight active slot
      if (box) {
        box.clear();
        const isActive = i === digits.length && digits.length < 4;
        const fillColor = isActive ? 0x1e2a3c : 0x1a2332;
        const strokeColor = isActive ? 0x00ffcc : 0x334455;

        box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).fill({ color: fillColor });
        box.roundRect(-SLOT_SIZE / 2, -SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, RADIUS).stroke({
          width: 2,
          color: strokeColor,
          alpha: isActive ? 0.8 : 0.3,
        });

        if (glow) {
          glow.alpha = isActive ? 0.3 : 0;
        }
      }
    }
    this.digitButtons.forEach((btn, i) => {
      if (this.rule === "position_only") btn.visible = true;
      else btn.visible = !this.codeValue.includes(String(KEYPAD_DIGITS[i]));
    });
  }

  private _addDigit(d: number): void {
    if (this.codeValue.length >= 4) return;
    if (this.rule === "standard" && this.codeValue.includes(String(d))) return;
    this.codeValue += d;
    this._refreshSlots();
  }

  private _backspace(): void {
    if (this.codeValue.length === 0) return;
    this.codeValue = this.codeValue.slice(0, -1);
    this._refreshSlots();
  }

  private _submitCode(): void {
    if (!isValidGuessForRule(this.codeValue, this.rule)) {
      this.statusText.text = this.rule === "position_only" ? "请输入 4 位数字" : "请输入 4 位不重复数字";
      this.statusText.style.fill = 0xffaa44;
      return;
    }
    if (!this.client.connected) {
      this.statusText.text = "未连接，请重试";
      this.statusText.style.fill = 0xff6644;
      return;
    }
    this.statusText.style.fill = 0xaaaaaa;
    this.myCode = this.codeValue; // 保存密码
    this.client.setCode(this.codeValue);
  }
}
