import type { Application } from "pixi.js";
import { Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { MusicToggle } from "@/components/MusicToggle";
import type { GameMode } from "@/types";

const TITLE_Y = 0.22;
const BUTTON_GAP = 15;
const BUTTON_START_Y = 0.40;

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
    this._addMusicButton();
  }

  private _addMusicButton(): void {
    const toggleSize = 48;

    // Settings button (left side of music toggle)
    const settingsBtn = new Container();

    const settingsCircle = new Graphics();
    settingsCircle.circle(0, 0, toggleSize / 2).fill({ color: 0x1a2332, alpha: 0.8 });
    settingsCircle.circle(0, 0, toggleSize / 2).stroke({ width: 2, color: 0x334455 });
    settingsBtn.addChild(settingsCircle);

    const settingsText = new Text({
      text: "⚙️",
      style: { fontSize: 24 },
    });
    settingsText.anchor.set(0.5);
    settingsBtn.addChild(settingsText);

    settingsBtn.x = this.app.screen.width - 16 - toggleSize * 2 - 10;
    settingsBtn.y = 16 + toggleSize / 2;
    settingsBtn.eventMode = "static";
    settingsBtn.cursor = "pointer";
    settingsBtn.on("pointerdown", () => this.opts.onModeSelect("settings"));
    this.addChild(settingsBtn);

    // Music toggle
    const musicToggle = new MusicToggle({
      x: this.app.screen.width - 16 - toggleSize,
      y: 16,
    });
    this.addChild(musicToggle);
  }

  private _loadCoverBg(): void {
    // Add gradient overlay
    const gradient = new Graphics();
    gradient.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({
      color: 0x0a0e14,
      alpha: 0.7,
    });
    this.addChildAt(gradient, 0);

    // Add animated particles
    this._addParticles();

    Assets.load("/cover-bg.jpeg").then((texture) => {
      const bg = new Sprite(texture);
      const w = this.app.screen.width;
      const h = this.app.screen.height;
      const scale = Math.max(w / texture.width, h / texture.height);
      bg.scale.set(scale);
      bg.anchor.set(0.5);
      bg.x = w / 2;
      bg.y = h / 2;
      bg.alpha = 0.6;
      this.addChildAt(bg, 0);
    });
  }

  private _addParticles(): void {
    const particleContainer = new Container();
    this.addChildAt(particleContainer, 1);

    const particles: Array<{ g: Graphics; vx: number; vy: number; life: number }> = [];

    // 减少粒子数量以提升性能
    for (let i = 0; i < 20; i++) {
      const g = new Graphics();
      const size = Math.random() * 2 + 1;
      g.circle(0, 0, size).fill({
        color: 0x00ffcc,
        alpha: Math.random() * 0.3 + 0.1,
      });
      g.x = Math.random() * this.app.screen.width;
      g.y = Math.random() * this.app.screen.height;
      particleContainer.addChild(g);

      particles.push({
        g,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: Math.random(),
      });
    }

    this.app.ticker.add(() => {
      particles.forEach((p) => {
        p.g.x += p.vx;
        p.g.y += p.vy;
        p.life += 0.01;
        p.g.alpha = 0.3 * Math.sin(p.life);

        if (p.g.x < 0) p.g.x = this.app.screen.width;
        if (p.g.x > this.app.screen.width) p.g.x = 0;
        if (p.g.y < 0) p.g.y = this.app.screen.height;
        if (p.g.y > this.app.screen.height) p.g.y = 0;
      });
    });
  }

  private _buildTitle(): Container {
    const container = new Container();

    // Animated glow circle - 缩小尺寸
    const glowCircle = new Graphics();
    glowCircle.circle(0, 0, 60).fill({
      color: 0x00ffcc,
      alpha: 0.1,
    });
    container.addChild(glowCircle);

    // Gradient background for title - 缩小尺寸
    const gradientBg = new Graphics();
    const gradWidth = 240;
    const gradHeight = 50;

    // Create a simple gradient by drawing multiple overlapping rectangles
    for (let i = 0; i < 20; i++) {
      const ratio = i / 20;
      const color = this._interpolateColor(0x00ffcc, 0x0088ff, ratio);
      gradientBg.rect(-gradWidth / 2, -gradHeight / 2 + i * 2.5, gradWidth, 2.5).fill({
        color,
        alpha: 0.8,
      });
    }
    gradientBg.y = 0;
    gradientBg.alpha = 0.3;
    container.addChild(gradientBg);

    // Title text - 缩小字号
    const t = new Text({
      text: "赛博密码",
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 40,
        fill: 0x00ffcc,
        fontWeight: "bold",
        dropShadow: {
          color: 0x00ffcc,
          blur: 10,
          alpha: 0.5,
          distance: 0,
        },
      },
    });
    t.anchor.set(0.5);
    container.addChild(t);

    // Subtitle - 缩小字号
    const subtitle = new Text({
      text: "CYBER BREAKER",
      style: {
        fontFamily: "system-ui, monospace",
        fontSize: 12,
        fill: 0x00ffcc,
        letterSpacing: 3,
      },
    });
    subtitle.anchor.set(0.5);
    subtitle.y = 30;
    subtitle.alpha = 0.6;
    container.addChild(subtitle);

    container.x = this.app.screen.width / 2;
    container.y = this.app.screen.height * TITLE_Y;

    // Pulse animation
    let time = 0;
    this.app.ticker.add(() => {
      time += 0.05;
      const scale = 1 + Math.sin(time) * 0.15;
      glowCircle.scale.set(scale);
      glowCircle.alpha = 0.05 + Math.sin(time) * 0.05;

      // Animate gradient background
      gradientBg.rotation = Math.sin(time * 0.5) * 0.1;
    });

    return container;
  }

  private _interpolateColor(color1: number, color2: number, ratio: number): number {
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;

    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;

    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);

    return (r << 16) | (g << 8) | b;
  }

  private _addButtons(): void {
    const cx = this.app.screen.width / 2;
    const baseY = this.app.screen.height * BUTTON_START_Y;
    const buttonWidth = Math.min(240, this.app.screen.width - 60);

    const single = new Button({
      label: "🎓 教学模式",
      width: buttonWidth,
      onClick: () => this.opts.onModeSelect("single"),
    });
    single.x = cx;
    single.y = baseY;
    this.addChild(single);

    const campaign = new Button({
      label: "🎯 关卡模式",
      width: buttonWidth,
      onClick: () => this.opts.onModeSelect("campaign"),
    });
    campaign.x = cx;
    campaign.y = baseY + single.height + BUTTON_GAP;
    this.addChild(campaign);

    const room = new Button({
      label: "⚔️ 联机对战",
      width: buttonWidth,
      onClick: () => this.opts.onModeSelect("room"),
    });
    room.x = cx;
    room.y = baseY + single.height * 2 + BUTTON_GAP * 2;
    this.addChild(room);

    const freeRoom = new Button({
      label: "🎲 多人房间",
      width: buttonWidth,
      onClick: () => this.opts.onModeSelect("free_room"),
    });
    freeRoom.x = cx;
    freeRoom.y = baseY + single.height * 3 + BUTTON_GAP * 3;
    this.addChild(freeRoom);

    const leaderboard = new Button({
      label: "🏆 排行榜",
      width: buttonWidth,
      onClick: () => this.opts.onModeSelect("leaderboard"),
    });
    leaderboard.x = cx;
    leaderboard.y = baseY + single.height * 4 + BUTTON_GAP * 4;
    this.addChild(leaderboard);
  }
}
