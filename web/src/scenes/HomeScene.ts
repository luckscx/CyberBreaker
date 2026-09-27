import type { Application } from "pixi.js";
import { Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { SceneChrome } from "@/components/SceneChrome";
import type { GameMode } from "@/types";

const TITLE_Y = 0.21;
const BUTTON_GAP = 15;
const BUTTON_START_Y = 0.41;

export interface HomeSceneOptions {
  onModeSelect: (mode: GameMode) => void;
}

export class HomeScene extends Container {
  private _tickers: Array<() => void> = [];
  private chrome!: SceneChrome;

  constructor(
    private app: Application,
    private opts: HomeSceneOptions
  ) {
    super();
    this._loadCoverBg();
    // 顶栏用统一外壳：返回键（此处无）/ 音乐键 / 设置键位置与全站一致。
    // 封面大图自带背景，故关掉外壳的背景层，避免把封面盖住。
    // 注意旧实现里设置键是「中心对齐」而音乐键是「左上角对齐」，
    // 两套原点混用导致点位难以推算，现在统一由 SceneChrome 决定。
    this.chrome = new SceneChrome({
      width: this.app.screen.width,
      height: this.app.screen.height,
      background: false,
      music: true,
      extras: ({ right, y, size }) => {
        const gear = new Container();
        const circle = new Graphics();
        circle.circle(0, 0, size / 2).fill({ color: 0x1a2332, alpha: 0.8 });
        circle.circle(0, 0, size / 2).stroke({ width: 2, color: 0x334455 });
        gear.addChild(circle);
        const icon = new Text({ text: "⚙️", style: { fontSize: 24 } });
        icon.anchor.set(0.5);
        gear.addChild(icon);
        gear.x = right - size / 2;
        gear.y = y + size / 2;
        gear.eventMode = "static";
        gear.cursor = "pointer";
        gear.on("pointertap", () => this.opts.onModeSelect("settings"));
        return gear;
      },
    });
    this.addChild(this.chrome);
    this.addChild(this._buildTitle());
    this._addButtons();
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this._tickers.forEach((fn) => this.app.ticker.remove(fn));
    this._tickers = [];
    super.destroy(options);
  }

  private _tick(fn: () => void): void {
    this._tickers.push(fn);
    this.app.ticker.add(fn);
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

    const particles: Array<{ g: Graphics; vx: number; vy: number; life: number; size: number }> = [];

    // 减少粒子数量以提升性能
    for (let i = 0; i < 20; i++) {
      const g = new Graphics();
      const size = Math.random() * 2 + 1;
      const isAccent = Math.random() < 0.3;
      g.circle(0, 0, size).fill({
        color: isAccent ? 0xff4dcc : 0x00ffcc,
        alpha: Math.random() * 0.3 + 0.1,
      });
      g.x = Math.random() * this.app.screen.width;
      g.y = Math.random() * this.app.screen.height;
      particleContainer.addChild(g);

      particles.push({
        g,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: Math.random() * Math.PI * 2,
        size,
      });
    }

    this._tick(() => {
      particles.forEach((p) => {
        p.g.x += p.vx;
        p.g.y += p.vy;
        p.life += 0.01;
        p.g.alpha = (0.12 + 0.24 * (Math.sin(p.life) * 0.5 + 0.5)) * (p.size / 2);

        if (p.g.x < 0) p.g.x = this.app.screen.width;
        if (p.g.x > this.app.screen.width) p.g.x = 0;
        if (p.g.y < 0) p.g.y = this.app.screen.height;
        if (p.g.y > this.app.screen.height) p.g.y = 0;
      });
    });
  }

  private _buildTitle(): Container {
    const container = new Container();
    const w = this.app.screen.width;

    // Animated glow circle
    const glowCircle = new Graphics();
    glowCircle.circle(0, 0, 62).fill({
      color: 0x00ffcc,
      alpha: 0.1,
    });
    container.addChild(glowCircle);

    // 外层光环
    const halo = new Graphics();
    halo.circle(0, 0, 92).stroke({ width: 2, color: 0x00ffcc, alpha: 0.14 });
    halo.circle(0, 0, 118).stroke({ width: 1, color: 0x00ffcc, alpha: 0.07 });
    container.addChild(halo);

    // Gradient background for title
    const gradientBg = new Graphics();
    const gradWidth = 240;
    const gradHeight = 50;

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

    // 底层光晕文字（霓虹外发光）
    const glowText = new Text({
      text: "赛博密码",
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 40,
        fill: 0x00ffcc,
        fontWeight: "bold",
        dropShadow: {
          color: 0x00ffcc,
          blur: 18,
          alpha: 0.9,
          distance: 0,
        },
      },
    });
    glowText.anchor.set(0.5);
    glowText.alpha = 0.55;
    container.addChild(glowText);

    // 顶层清晰文字
    const t = new Text({
      text: "赛博密码",
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 40,
        fill: 0xeafffb,
        fontWeight: "bold",
        stroke: { color: 0x00ffcc, width: 2 },
      },
    });
    t.anchor.set(0.5);
    container.addChild(t);

    // Subtitle
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
    subtitle.y = 32;
    subtitle.alpha = 0.6;
    container.addChild(subtitle);

    // 两侧装饰线
    const decoY = -6;
    const decoGap = 150;
    const decoLen = 46;
    const leftDeco = new Graphics();
    leftDeco.moveTo(-decoGap, decoY);
    leftDeco.lineTo(-decoGap + decoLen, decoY);
    leftDeco.moveTo(-decoGap, decoY - 3);
    leftDeco.lineTo(-decoGap + 10, decoY - 3);
    leftDeco.stroke({ width: 2, color: 0x00ffcc, alpha: 0.5 });
    container.addChild(leftDeco);

    const rightDeco = new Graphics();
    rightDeco.moveTo(decoGap, decoY);
    rightDeco.lineTo(decoGap - decoLen, decoY);
    rightDeco.moveTo(decoGap, decoY - 3);
    rightDeco.lineTo(decoGap - 10, decoY - 3);
    rightDeco.stroke({ width: 2, color: 0x00ffcc, alpha: 0.5 });
    container.addChild(rightDeco);

    container.x = w / 2;
    container.y = this.app.screen.height * TITLE_Y;

    // Pulse animation
    let time = 0;
    this._tick(() => {
      time += 0.05;
      const scale = 1 + Math.sin(time) * 0.15;
      glowCircle.scale.set(scale);
      glowCircle.alpha = 0.05 + Math.sin(time) * 0.05;
      halo.scale.set(1 + Math.sin(time * 0.7) * 0.04);
      halo.alpha = 0.6 + Math.sin(time * 0.7) * 0.4;
      glowText.alpha = 0.4 + Math.sin(time) * 0.18;

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

    const defs: Array<{ label: string; mode: GameMode }> = [
      { label: "🎓 教学模式", mode: "single" },
      { label: "🎯 关卡模式", mode: "campaign" },
      { label: "⚔️ 联机对战", mode: "room" },
      { label: "🎲 多人房间", mode: "free_room" },
      { label: "🏆 排行榜", mode: "leaderboard" },
    ];

    const buttons: Button[] = [];

    defs.forEach((def, i) => {
      const btn = new Button({
        label: def.label,
        width: buttonWidth,
        onClick: () => this.opts.onModeSelect(def.mode),
      });
      btn.x = cx;
      btn.y = baseY + (btn.height + BUTTON_GAP) * i;
      btn.alpha = 0;
      btn.y += 26;
      this.addChild(btn);
      buttons.push(btn);
    });

    // 入场动画：依次滑入
    const startTime = Date.now();
    const stagger = 90;
    const duration = 320;
    const onFrame = () => {
      const elapsed = Date.now() - startTime;
      buttons.forEach((btn, i) => {
        const local = elapsed - i * stagger;
        if (local <= 0) return;
        const progress = Math.min(local / duration, 1);
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        btn.alpha = eased;
        btn.y = baseY + (btn.height + BUTTON_GAP) * i + (1 - eased) * 26;
      });
      if (elapsed > stagger * buttons.length + duration) {
        // 动画完成，自我移除
        this.app.ticker.remove(onFrame);
        this._tickers = this._tickers.filter((fn) => fn !== onFrame);
      }
    };
    this._tick(onFrame);
  }
}
