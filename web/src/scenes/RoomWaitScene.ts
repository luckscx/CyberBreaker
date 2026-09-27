import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { GuessInput } from "@/components/GuessInput";
import { SceneChrome } from "@/components/SceneChrome";
import { RoomClient, type RoomRole } from "@/room/client";
import type { RoomRule } from "@/room/client";
import { isValidGuessForRule } from "@/logic/guess";
import { ITEM_TYPE_DIGITS } from "@/types/itemTypes";
import { computePlayGeometry, computePlayScreen, observeResize } from "@/ui/layout";
import { Color, Font, Size } from "@/ui/theme";

export interface RoomWaitSceneOptions {
  app: Application;
  client: RoomClient;
  roomId: string;
  role: RoomRole;
  joinUrl?: string;
  onGameStart: (turn: RoomRole, turnStartAt: number, rule: RoomRule, myCode: string, inventory?: { [itemId: string]: number }, history?: { role: RoomRole; guess: string; result: string; timestamp: number }[]) => void;
  onBack: () => void;
}

const CIRCLE_R = 12;
const CIRCLE_GAP = 40;

export class RoomWaitScene extends Container {
  private statusText: Text;
  private codeContainer: Container;
  private guessInput!: GuessInput;
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
  private chrome: SceneChrome;
  private app: Application;
  private rule: RoomRule = "standard";
  private ruleLabel: Text | null = null;
  private myCode = ""; // 保存自己设置的密码
  private inventory: { [itemId: string]: number } = {};
  private stopResize: (() => void) | null = null;
  private codeHint: Text | null = null;

  constructor(private opts: RoomWaitSceneOptions) {
    super();
    const { app, client, role, joinUrl, onBack } = opts;
    this.app = app;
    this.client = client;
    this.role = role;
    const w = app.screen.width;
    const cx = w / 2;

    // 统一顶栏（原来返回键在 (16,16)、音乐键 w-64，且标题缺位）
    this.chrome = new SceneChrome({
      width: app.screen.width,
      height: app.screen.height,
      onBack: () => onBack(),
      title: "对战房间",
      subtitle: "双方各自设置 4 位密码，然后轮流破解对方",
      particleCount: 20,
    });
    this.addChild(this.chrome);

    // 所有纵向位置改为「顶栏下方 + 自下而上贴底」，矮屏不再把键盘挤出屏幕
    const geometry = computePlayGeometry(w, ITEM_TYPE_DIGITS);
    const layout = computePlayScreen({
      chrome: this.chrome,
      geometry,
      showSlots: true,
    });

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
      this.shareBar = this._buildShareBar(app, joinUrl, layout.stats.y + 92);
      this.addChild(this.shareBar);
    }

    this.statusText = new Text({
      text: "连接中...",
      style: { fontFamily: Font.sans, fontSize: Size.bodySm + 1, fill: Color.textSub },
    });
    this.statusText.anchor.set(0.5);
    this.statusText.x = cx;
    this.statusText.y = layout.stats.y + 12;
    this.addChild(this.statusText);

    const statusY = layout.stats.y + 48;
    this.myCircle = this._drawCircle(false);
    this.myCircle.x = cx - CIRCLE_GAP;
    this.myCircle.y = statusY;
    this.addChild(this.myCircle);
    this.myLabel = new Text({
      text: "我方",
      style: { fontFamily: Font.sans, fontSize: Size.micro, fill: Color.textMuted },
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
      style: { fontFamily: Font.sans, fontSize: Size.micro, fill: Color.textMuted },
    });
    this.peerLabel.anchor.set(0.5, 0);
    this.peerLabel.x = cx + CIRCLE_GAP;
    this.peerLabel.y = statusY + CIRCLE_R + 4;
    this.addChild(this.peerLabel);

    // 密码面板：整体贴底。GuessInput 本身以「顶部中心」为原点，
    // 直接给 x = 屏幕中心即可居中；原实现额外设了 pivot.x = width/2，
    // 会把键盘整体左移半个宽度（与上方输入槽错位）。
    this.codeContainer = new Container();
    this.codeContainer.visible = false;

    this.codeHint = new Text({
      text: "设置你的 4 位密码（对方要猜的数字）",
      style: { fontFamily: Font.sans, fontSize: Size.bodySm, fill: Color.textSub, align: "center" },
    });
    this.codeHint.anchor.set(0.5);
    this.codeHint.x = cx;
    this.codeHint.y = layout.inputTop - 46;
    this.codeContainer.addChild(this.codeHint);

    this.ruleLabel = new Text({
      text: "",
      style: { fontFamily: Font.sans, fontSize: Size.caption, fill: Color.textMuted },
    });
    this.ruleLabel.anchor.set(0.5);
    this.ruleLabel.x = cx;
    this.ruleLabel.y = layout.inputTop - 26;
    this.codeContainer.addChild(this.ruleLabel);

    this.guessInput = new GuessInput({
      screenWidth: w,
      itemType: ITEM_TYPE_DIGITS,
      allowRepeat: this.rule === "position_only",
      onSubmit: (code) => this._submitCode(code),
    });
    this.guessInput.x = cx;
    this.guessInput.y = layout.inputTop;
    this.codeContainer.addChild(this.guessInput);

    this._updateRuleLabel();

    this.addChild(this.codeContainer);

    // 旋转 / 地址栏收起后重建，避免沿用旧坐标
    this.stopResize = observeResize(() => this._relayout());

    this.unsub = this.client.onMessage((msg) => this._onMsg(msg));
    this.statusText.text = role === "host" ? "等待对方加入..." : "已加入房间，等待房主...";

    // Start animation
    this.app.ticker.add(this._animate, this);
  }

  private _animate = (): void => {
    this.chrome?.animate();
  };

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.stopResize?.();
    this.stopResize = null;
    this.unsub?.();
    this.app.ticker.remove(this._animate, this);
    super.destroy(options);
  }

  /**
   * 尺寸变化：只重建位置相关元素，WS 连接与已设置的密码都不受影响。
   * （不能整场景重建 —— client 是外部注入的，重建会把订阅丢掉。）
   */
  private _relayout(): void {
    const w = this.app.screen.width;
    const cx = w / 2;
    const geometry = computePlayGeometry(w, ITEM_TYPE_DIGITS);
    const layout = computePlayScreen({ chrome: this.chrome, geometry, showSlots: true });

    this.statusText.y = layout.stats.y + 12;
    this.myCircle.y = layout.stats.y + 48;
    this.peerCircle.y = layout.stats.y + 48;
    this.myLabel.y = layout.stats.y + 48 + CIRCLE_R + 4;
    this.peerLabel.y = layout.stats.y + 48 + CIRCLE_R + 4;
    if (this.shareBar) this.shareBar.y = layout.stats.y + 92;
    if (this.codeHint) this.codeHint.y = layout.inputTop - 46;
    if (this.ruleLabel) this.ruleLabel.y = layout.inputTop - 26;
    this.guessInput.x = cx;
    this.guessInput.y = layout.inputTop;
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
    inventory?: { [itemId: string]: number };
  }): void {
    if (msg.type === "room_joined") {
      if (msg.rule !== undefined) {
        this.rule = msg.rule;
        this._updateRuleLabel();
        this.guessInput?.setAllowRepeat(this.rule === "position_only");
      }
      if (msg.inventory !== undefined) {
        this.inventory = msg.inventory;
        console.log("[RoomWaitScene] received inventory:", this.inventory);
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
          this.opts.onGameStart(msg.turn!, msg.turnStartAt ?? Date.now(), msg.rule ?? this.rule, this.myCode, this.inventory, msg.history);
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
      this.opts.onGameStart(msg.turn, msg.turnStartAt ?? Date.now(), msg.rule ?? this.rule, this.myCode, this.inventory, msg.history);
    }
    if (msg.type === "error") {
      this.statusText.text = msg.error ?? "错误";
      this.statusText.style.fill = 0xff6644;
    }
  }

  private _buildShareBar(app: import("pixi.js").Application, joinUrl: string, y: number): Container {
    const w = app.screen.width;
    const cx = w / 2;
    const bar = new Container();
    bar.x = cx;
    bar.y = y;

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

  private _submitCode(code: string): void {
    if (!isValidGuessForRule(code, this.rule)) {
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
    this.myCode = code;
    this.client.setCode(code);
    this.guessInput.clear();
  }
}
