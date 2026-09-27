import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { playClick, playDisabledClick } from "@/audio/click";
import { Touch } from "@/ui/theme";

const DEPTH = 4; // 3D 深度
const RADIUS = 6;

export type KeyVariant = "default" | "success" | "danger";

export interface KeyButtonOptions {
  label: string;
  width: number;
  height: number;
  fontSize?: number;
  onClick: () => void;
  playSound?: boolean; // 是否播放点击音效，默认true
  disabled?: boolean; // 禁用态：灰色、按下播放闷音
  /** 配色变体：default 青 / success 绿 / danger 橙红 */
  variant?: KeyVariant;
}

interface Palette {
  accent: number;
  topFrom: number;
  topTo: number;
  sideFrom: number;
  sideTo: number;
}

const PALETTES: Record<KeyVariant, Palette> = {
  default: {
    accent: 0x00ffcc,
    topFrom: 0x2b3a50,
    topTo: 0x1a2636,
    sideFrom: 0x0a1420,
    sideTo: 0x1a2636,
  },
  success: {
    accent: 0x35ffa8,
    topFrom: 0x1e3a34,
    topTo: 0x14261f,
    sideFrom: 0x08170f,
    sideTo: 0x14261f,
  },
  danger: {
    accent: 0xff7a4d,
    topFrom: 0x3d2a2c,
    topTo: 0x2a1d1f,
    sideFrom: 0x1a0d0e,
    sideTo: 0x2a1d1f,
  },
};

export class KeyButton extends Container {
  private bottomShadow: Graphics;
  private sideFace: Graphics;
  private topFace: Graphics;
  private ripple: Graphics;
  private flash: Graphics;
  private pulse: Graphics;
  private faceGroup: Container;
  private labelText: Text;
  private _w: number;
  private _h: number;
  private isPressed = false;
  private animFrame: number = 0;
  private currentDepth = DEPTH;
  private playSound: boolean;
  private _disabled: boolean;
  private _ready = false;
  private _hovered = false;
  private palette: Palette;
  private _pulseRaf: number = 0;
  private _pulseStart = 0;
  /** 「已排除 / 已占用」置灰角标 */
  private _muted = false;
  private _mutedBadgeText?: string;
  private mutedBadge: Text | null = null;
  /** 本次按下的指针，用于滑动取消判定 */
  private pressPointerId = -1;
  private pressStartX = 0;
  private pressStartY = 0;
  private pressCancelled = false;

  constructor(opts: KeyButtonOptions) {
    super();
    this._w = opts.width;
    this._h = opts.height;
    this.playSound = opts.playSound ?? true;
    this._disabled = opts.disabled ?? false;
    this.palette = PALETTES[opts.variant ?? "default"];
    this.eventMode = "static";
    this.cursor = this._disabled ? "not-allowed" : "pointer";

    // Bottom shadow (最底层)
    this.bottomShadow = new Graphics();
    this.addChild(this.bottomShadow);

    // Side face (侧面 - 3D 效果)
    this.sideFace = new Graphics();
    this.addChild(this.sideFace);

    // 顶面 + 特效 + 文字 统一放一组，按下时整体下沉
    this.faceGroup = new Container();

    this.topFace = new Graphics();
    this.faceGroup.addChild(this.topFace);

    // 就绪脉冲光环
    this.pulse = new Graphics();
    this.pulse.alpha = 0;
    this.faceGroup.addChild(this.pulse);

    // 按下冲击波
    this.ripple = new Graphics();
    this.ripple.alpha = 0;
    this.faceGroup.addChild(this.ripple);

    // 按下瞬闪
    this.flash = new Graphics();
    this.flash.alpha = 0;
    this.faceGroup.addChild(this.flash);

    const fontSize = opts.fontSize ?? 24;
    this.labelText = new Text({
      text: opts.label,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize,
        fill: 0xdffff7,
        fontWeight: "bold",
        dropShadow: {
          color: this.palette.accent,
          blur: 6,
          alpha: 0.75,
          distance: 0,
        },
      },
    });
    this.labelText.anchor.set(0.5);
    this.faceGroup.addChild(this.labelText);

    this.addChild(this.faceGroup);

    this.hitArea = new Rectangle(
      -this._w / 2,
      -this._h / 2 - DEPTH,
      this._w,
      this._h + DEPTH
    );

    this._draw3DButton(DEPTH);
    this._applyStateLook();

    // ── 点按语义 ──
    // 旧实现直接在 pointerdown 里触发 onClick：手机上手指在相邻键之间滑过
    // 就会连点，且误触无法挽回（键间距只有 6~8px）。
    // 现在：pointerdown 只给视觉反馈，真正的 onClick 走 pointertap
    //（按下与抬起必须落在同一对象），位移超过阈值则判定为滑动并取消。
    this.on("pointerdown", (e) => {
      this.pressPointerId = e.pointerId;
      this.pressStartX = e.global.x;
      this.pressStartY = e.global.y;
      this.pressCancelled = false;
      if (this._disabled) return;
      this._animatePress();
    });

    this.on("globalpointermove", (e) => {
      if (this.pressPointerId !== e.pointerId || this.pressCancelled) return;
      if (this._disabled) return;
      const dx = e.global.x - this.pressStartX;
      const dy = e.global.y - this.pressStartY;
      if (Math.hypot(dx, dy) > Touch.cancelSlop) {
        this.pressCancelled = true;
        this._draw3DButton(DEPTH);
      }
    });

    const endPress = () => {
      this.pressPointerId = -1;
    };
    this.on("pointerup", endPress);
    this.on("pointercancel", endPress);
    this.on("pointerupoutside", () => {
      this.pressPointerId = -1;
      this.pressCancelled = false;
    });

    this.on("pointertap", () => {
      if (this.pressCancelled) {
        this.pressCancelled = false;
        return;
      }
      if (this._disabled) {
        playDisabledClick();
        this._animateShake();
        return;
      }
      if (this.playSound) playClick();
      opts.onClick();
    });
    this.on("pointerover", () => {
      this._hovered = true;
      this._redraw();
      this._animateHover(true);
    });
    this.on("pointerout", () => {
      this._hovered = false;
      this._redraw();
      this._animateHover(false);
    });
  }

  get width(): number {
    return this._w;
  }
  get height(): number {
    return this._h + DEPTH;
  }

  setLabel(text: string): void {
    this.labelText.text = text;
  }

  setDisabled(disabled: boolean): void {
    if (this._disabled === disabled) return;
    this._disabled = disabled;
    this.cursor = disabled ? "not-allowed" : "pointer";
    this._applyStateLook();
    this._redraw();
  }

  get disabled(): boolean {
    return this._disabled;
  }

  /**
   * 置灰但仍占位（用于「本回合已使用」「已被道具排除」的物品键）。
   *
   * 与 setDisabled 的差别：键盘布局保持不变，并额外显示一个角标说明原因。
   * 旧实现是把这类键直接 `visible = false`，键盘上出现空洞 →
   * 玩家按位置记忆点键时极易错按，是手机上误触的主要来源之一。
   */
  setMuted(muted: boolean, badge?: string): void {
    if (this._muted === muted && this._mutedBadgeText === badge) return;
    this._muted = muted;

    if (muted && badge) {
      if (!this.mutedBadge) {
        this.mutedBadge = new Text({
          text: badge,
          style: {
            fontFamily: "system-ui, sans-serif",
            fontSize: 9,
            fill: 0xffffff,
            fontWeight: "bold",
          },
        });
        this.mutedBadge.anchor.set(0.5);
        this.mutedBadge.alpha = 0.8;
      }
      this.mutedBadge.text = badge;
      this.mutedBadge.y = this._h / 2 - 4;
      if (!this.mutedBadge.parent) this.faceGroup.addChild(this.mutedBadge);
      this.mutedBadge.visible = true;
    } else if (this.mutedBadge) {
      this.mutedBadge.visible = false;
    }
    this._mutedBadgeText = muted ? badge : undefined;

    // 置灰视觉：整体压暗 + 降饱和感（用 alpha 与描边一起表达）
    this.alpha = this._disabled ? 0.45 : muted ? 0.62 : 1;
  }

  /** 就绪态：持续脉冲发光，引导用户点击（如 4 位填齐后的确认键） */
  setReady(ready: boolean): void {
    if (this._ready === ready) return;
    this._ready = ready;
    if (ready && !this._disabled) {
      this._startPulse();
    } else {
      this._stopPulse();
    }
    this._redraw();
  }

  private _applyStateLook(): void {
    const disabledNow = this._disabled;
    this.alpha = disabledNow ? 0.45 : 1;
    this.labelText.style.fill = disabledNow ? 0x7d8fa6 : 0xdffff7;
    this.labelText.style.dropShadow = disabledNow
      ? { color: 0x000000, blur: 2, alpha: 0.4, angle: 0, distance: 0 }
      : {
          color: this.palette.accent,
          blur: 6,
          alpha: 0.75,
          angle: 0,
          distance: 0,
        };
    if (disabledNow) this._stopPulse();
  }

  private _redraw(): void {
    this._draw3DButton(this.currentDepth);
  }

  private _draw3DButton(depth: number): void {
    const w = this._w;
    const h = this._h;
    const p = this.palette;
    const dim = this._disabled;
    const accent = dim ? 0x5a6b7d : p.accent;

    // ── 底部投影（多层模拟模糊） ──
    this.bottomShadow.clear();
    for (let i = 3; i >= 1; i--) {
      this.bottomShadow
        .roundRect(-w / 2 + i * 0.6, -h / 2 + depth + 1.5, w - i * 1.2, h, RADIUS)
        .fill({ color: 0x000000, alpha: 0.12 });
    }

    // ── 侧面（渐变） ──
    this.sideFace.clear();
    const sideHeight = Math.max(1, depth);
    for (let i = 0; i < sideHeight; i++) {
      const ratio = i / sideHeight;
      const color = this._interpolateColor(p.sideFrom, p.sideTo, ratio);
      this.sideFace
        .roundRect(-w / 2, -h / 2 + i, w, 1.2, i === 0 ? RADIUS : 0)
        .fill({ color });
    }

    // ── 顶面主体（渐变） ──
    this.topFace.clear();
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const ratio = i / steps;
      const color = this._interpolateColor(
        dim ? 0x20293a : p.topFrom,
        dim ? 0x141b28 : p.topTo,
        ratio
      );
      const y = -h / 2 + (i * h) / steps;
      this.topFace
        .roundRect(-w / 2, y, w, h / steps + 1, i === 0 ? RADIUS : 0)
        .fill({ color });
    }

    // 顶部玻璃高光
    this.topFace
      .roundRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h / 2.6, RADIUS - 2)
      .fill({ color: 0xffffff, alpha: dim ? 0.04 : this._hovered ? 0.14 : 0.09 });

    // 底部内侧暗边（增强立体）
    this.topFace
      .roundRect(-w / 2 + 1.5, h / 2 - 6, w - 3, 4.5, 3)
      .fill({ color: 0x000000, alpha: 0.28 });

    // 霓虹边框
    const borderAlpha = dim ? 0.16 : this._hovered ? 0.95 : 0.5;
    this.topFace
      .roundRect(-w / 2, -h / 2, w, h, RADIUS)
      .stroke({ width: 2, color: accent, alpha: borderAlpha });

    if (!dim) {
      // 四角 HUD 角标
      const c = Math.min(10, w * 0.16);
      const inset = 4;
      const cornerAlpha = this._hovered ? 0.9 : 0.55;
      const corners: Array<[number, number, number, number]> = [
        [-w / 2 + inset, -h / 2 + inset, c, c],
        [w / 2 - inset, -h / 2 + inset, -c, c],
        [-w / 2 + inset, h / 2 - inset, c, -c],
        [w / 2 - inset, h / 2 - inset, -c, -c],
      ];
      corners.forEach(([x, y, dx, dy]) => {
        this.topFace.moveTo(x, y + dy).lineTo(x, y).lineTo(x + dx, y);
      });
      this.topFace.stroke({ width: 1.6, color: accent, alpha: cornerAlpha });

      // 底部 LED 光条
      this.topFace
        .roundRect(-w / 2 + 8, h / 2 - 3.5, w - 16, 2, 1)
        .fill({ color: accent, alpha: this._hovered ? 0.95 : 0.55 });
    }

    // ── 特效层 ──
    this.ripple.clear();
    this.ripple
      .roundRect(-w / 2, -h / 2, w, h, RADIUS)
      .stroke({ width: 3, color: p.accent });

    this.flash.clear();
    this.flash
      .roundRect(-w / 2, -h / 2, w, h, RADIUS)
      .fill({ color: 0xffffff });

    this.pulse.clear();
    this.pulse
      .roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, RADIUS + 3)
      .stroke({ width: 4, color: p.accent });
    this.pulse
      .roundRect(-w / 2, -h / 2, w, h, RADIUS)
      .fill({ color: p.accent, alpha: 0.12 });

    this.currentDepth = depth;
    this.faceGroup.y = -depth;
    this.labelText.y = 0;
  }

  private _animateHover(entering: boolean): void {
    if (this.isPressed || this._disabled) return;

    const targetY = entering ? -2.5 : 0;
    const startY = this.faceGroup.y + DEPTH;
    const duration = 150;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = this._easeOutCubic(progress);

      const newY = startY + (targetY - startY) * eased;
      this._draw3DButton(Math.max(0, DEPTH - newY));
      this.labelText.scale.set(entering ? 1 + 0.06 * eased : 1);

      if (progress < 1) {
        this.animFrame = requestAnimationFrame(animate);
      }
    };

    cancelAnimationFrame(this.animFrame);
    animate();
  }

  /** 按下：3D 下沉 + 冲击波扩散 + 瞬闪 + 文字弹跳 */
  private _animatePress(): void {
    this.isPressed = true;
    const pressDuration = 70;
    const releaseDuration = 150;
    const startDepth = this.currentDepth;
    const startTime = Date.now();

    // 冲击波 & 瞬闪各自独立播放
    this._playRipple();
    this._playFlash();
    this._playLabelPop();

    const animate = () => {
      const elapsed = Date.now() - startTime;

      let depth: number;
      if (elapsed < pressDuration) {
        // 快速下压
        const t = elapsed / pressDuration;
        depth = startDepth * (1 - this._easeOutQuad(t));
      } else if (elapsed < pressDuration + releaseDuration) {
        // 弹回
        const t = (elapsed - pressDuration) / releaseDuration;
        depth = DEPTH * this._easeOutElastic(t);
      } else {
        depth = DEPTH;
      }

      this._draw3DButton(Math.max(0, depth));

      if (elapsed < pressDuration + releaseDuration) {
        requestAnimationFrame(animate);
      } else {
        this.isPressed = false;
        this._draw3DButton(DEPTH);
      }
    };

    animate();
  }

  /** 从按键中心向外扩散的冲击波 */
  private _playRipple(): void {
    const duration = 280;
    const start = Date.now();
    const step = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const eased = this._easeOutCubic(t);
      this.ripple.alpha = 0.85 * (1 - eased);
      this.ripple.scale.set(0.55 + eased * 0.75);
      if (t < 1) requestAnimationFrame(step);
      else this.ripple.alpha = 0;
    };
    this.ripple.scale.set(0.55);
    step();
  }

  /** 按下瞬间的白光闪 */
  private _playFlash(): void {
    const duration = 130;
    const start = Date.now();
    const step = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      this.flash.alpha = 0.6 * (1 - t) * (1 - t);
      if (t < 1) requestAnimationFrame(step);
      else this.flash.alpha = 0;
    };
    step();
  }

  /** 文字弹跳放大 */
  private _playLabelPop(): void {
    const duration = 240;
    const start = Date.now();
    const step = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const scale = 1 + 0.32 * (1 - t) * Math.cos(t * Math.PI * 1.5);
      this.labelText.scale.set(scale);
      if (t < 1) requestAnimationFrame(step);
      else this.labelText.scale.set(this._hovered ? 1.06 : 1);
    };
    step();
  }

  /** 禁用键被点击时左右抖动 */
  private _animateShake(): void {
    const duration = 220;
    const start = Date.now();
    const step = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      this.faceGroup.x = Math.sin(t * Math.PI * 6) * 3 * (1 - t);
      if (t < 1) requestAnimationFrame(step);
      else this.faceGroup.x = 0;
    };
    step();
  }

  /** 就绪脉冲：持续呼吸发光 */
  private _startPulse(): void {
    if (this._pulseRaf) return;
    this._pulseStart = Date.now();
    const step = () => {
      const t = (Date.now() - this._pulseStart) / 1000;
      const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.6);
      this.pulse.alpha = 0.25 + wave * 0.6;
      this.pulse.scale.set(1 + wave * 0.035);
      this._pulseRaf = requestAnimationFrame(step);
    };
    step();
  }

  private _stopPulse(): void {
    if (this._pulseRaf) cancelAnimationFrame(this._pulseRaf);
    this._pulseRaf = 0;
    this.pulse.alpha = 0;
    this.pulse.scale.set(1);
  }

  private _easeOutQuad(t: number): number {
    return t * (2 - t);
  }

  private _easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  private _easeOutElastic(t: number): number {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
      ? 0
      : t === 1
      ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
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

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    cancelAnimationFrame(this.animFrame);
    this._stopPulse();
    super.destroy(options);
  }
}
