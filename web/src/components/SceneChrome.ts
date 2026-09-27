import { Container, Graphics, Text } from "pixi.js";
import { BackButton } from "./BackButton";
import { MusicToggle } from "./MusicToggle";
import { Background } from "./Background";
import { Color, Font, Screen, Size } from "@/ui/theme";
import { readSafeArea } from "@/ui/layout";

export interface SceneChromeOptions {
  width: number;
  height: number;
  /** 左上角返回按钮回调；不传则不渲染返回按钮 */
  onBack?: () => void;
  /** 顶栏标题（居中） */
  title?: string;
  /** 标题下方的一行副标题 / 规则说明 */
  subtitle?: string;
  /** 是否渲染右上角音乐开关，默认 true */
  music?: boolean;
  /** 是否渲染动态背景，默认 true */
  background?: boolean;
  /** 背景粒子数量 */
  particleCount?: number;
  /**
   * 在顶栏右侧（音乐键左边）追加自定义控件。
   * 回调给出可用的右侧边界与行高，调用方应把控件放在 (right - size, y)。
   * 用于关卡模式的背包键等场景专属入口，避免各自硬编码 x 坐标。
   */
  extras?: (ctx: { right: number; y: number; size: number }) => Container | null;
}

/** 顶栏内返回 / 音乐按钮的固定边长 */
const CTRL = 48;

/**
 * 统一场景外壳。
 *
 * 之前每个场景各自摆放返回键、音乐键与标题，坐标和字号有 4-5 套写法
 * （12/16/40、fontSize 20/24/26/28…），导致「返回键乱跳」。现在所有场景
 * 共用这一个外壳，返回键永远在左上、音乐键永远在右上、标题永远居中同一基线。
 *
 * 坐标约定：外壳整体以 (0,0) 为屏幕左上角建立。
 * 子类/调用方应当把内容排布在 `contentTop` 之下，并让内容右边界不超过 `contentRight`。
 */
export class SceneChrome extends Container {
  /** 安全区（已计入顶栏高度） */
  readonly safe = readSafeArea();
  /** 内容区起始 y（顶栏下方，含安全区） */
  readonly contentTop: number;
  /** 内容区左右边界 */
  readonly contentLeft: number;
  readonly contentRight: number;
  /** 内容区可用宽度 */
  readonly contentWidth: number;
  /** 屏幕底部安全线（内容不应低于此线） */
  readonly contentBottom: number;

  private bg: Background | null = null;

  constructor(opts: SceneChromeOptions) {
    super();
    const w = opts.width;
    const h = opts.height;

    const safe = this.safe;
    this.contentLeft = Screen.padX + safe.left;
    this.contentRight = w - Screen.padX - safe.right;
    this.contentWidth = Math.max(0, this.contentRight - this.contentLeft);
    this.contentBottom = h - Screen.padBottom - safe.bottom;
    this.contentTop = safe.top + Screen.topBar;

    if (opts.background !== false) {
      this.bg = new Background({
        width: w,
        height: h,
        particleCount: opts.particleCount ?? 25,
      });
      this.addChild(this.bg);
    }

    const topY = safe.top + (Screen.topBar - CTRL) / 2;

    if (opts.onBack) {
      const back = new BackButton({
        x: this.contentLeft,
        y: topY,
        size: CTRL,
        onClick: opts.onBack,
      });
      this.addChild(back);
    }

    if (opts.music !== false) {
      const music = new MusicToggle({
        x: this.contentRight - CTRL,
        y: topY,
        size: CTRL,
      });
      this.addChild(music);
    }

    if (opts.extras) {
      // 预留一个与音乐键同尺寸、间距 10 的位置给场景自定义控件
      const extra = opts.extras({
        right: this.contentRight - (opts.music !== false ? CTRL + 10 : 0),
        y: topY,
        size: CTRL,
      });
      if (extra) this.addChild(extra);
    }

    const hasSub = !!opts.subtitle;
    // 有副标题时标题上移，使「标题 + 副标题」整体在顶栏内垂直居中
    const titleY = safe.top + Screen.topBar / 2;
    const title = new Text({
      text: opts.title ?? "",
      style: {
        fontFamily: Font.sans,
        fontSize: Size.sectionTitle,
        fill: Color.primary,
        fontWeight: "bold",
        align: "center",
        wordWrap: true,
        wordWrapWidth: Math.max(80, this.contentWidth - CTRL * 2 - 16),
      },
    });
    title.anchor.set(0.5);
    title.x = w / 2;
    title.y = hasSub ? titleY - 10 : titleY;
    title.visible = !!opts.title;
    this.addChild(title);

    if (hasSub) {
      const sub = new Text({
        text: opts.subtitle!,
        style: {
          fontFamily: Font.sans,
          fontSize: Size.caption,
          fill: Color.textMuted,
          align: "center",
          wordWrap: true,
          wordWrapWidth: Math.max(120, this.contentWidth - 24),
          lineHeight: 15,
        },
      });
      sub.anchor.set(0.5, 0);
      sub.x = w / 2;
      sub.y = titleY + 4;
      this.addChild(sub);
    }
  }

  /** 驱动背景动画，需在 ticker 中调用 */
  animate(): void {
    this.bg?.animate();
  }
}
