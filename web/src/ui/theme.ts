/**
 * 设计令牌（Design Tokens）
 *
 * 全站统一的设计语言底座：色板、字体层级、间距、圆角、动效。
 * 所有界面元素都应从这里取值，避免散落的魔法数字。
 */

/** 品牌色板 —— 赛博霓虹 / 深空玻璃 */
export const Color = {
  /** 背景层（由深到浅） */
  bgDeep: 0x05070d,
  bgBase: 0x0a0e18,
  bgElevated: 0x111827,
  bgPanel: 0x161f31,
  bgPanelHover: 0x1d2840,

  /** 主色：霓虹青 */
  primary: 0x2ff3d0,
  primaryDim: 0x1b9c8a,
  primarySoft: 0x8ffbe9,

  /** 辅色：电子紫 */
  secondary: 0x8b6cff,
  /** 强调：琥珀 */
  accent: 0xffc542,
  /** 危险 / 失败 */
  danger: 0xff5c7a,
  /** 成功 */
  success: 0x3ddc97,
  /** 警告 / 计时 */
  warning: 0xffa63d,

  /** 文本层级 */
  text: 0xf2f7ff,
  textSub: 0xa7b6cf,
  textMuted: 0x6b7c96,
  textFaint: 0x43536b,

  /** 描边 / 分隔线 */
  line: 0x24304a,
  lineStrong: 0x33425f,

  /** 特殊 */
  gold: 0xffd45e,
  violet: 0xb79bff,
} as const;

/** 字体族：中西文分离，保证中文与等宽数字都好看 */
export const Font = {
  /** 正文 / 标题 */
  sans: 'Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
  /** 数字 / 代码 / 历史记录 */
  mono: '"SF Mono", "JetBrains Mono", Menlo, Consolas, "Courier New", monospace',
} as const;

/** 字号层级 */
export const Size = {
  hero: 44,
  title: 28,
  sectionTitle: 20,
  body: 15,
  bodySm: 13,
  caption: 11,
  micro: 10,
} as const;

/** 圆角 */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** 间距（4pt 基准栅格） */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** 屏幕安全边距 */
export const Screen = {
  padX: 20,
  padTop: 18,
  /** 顶部导航条高度（返回 / 音乐按钮所在行） */
  topBar: 56,
} as const;

/** 动效时长（毫秒） */
export const Motion = {
  fast: 120,
  normal: 200,
  slow: 320,
} as const;

/** 缓动函数 */
export const Ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBack: (t: number) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
} as const;

/** 颜色工具：线性插值混合两个 0xRRGGBB 颜色 */
export function mixColor(c1: number, c2: number, ratio: number): number {
  const r = Math.round((((c1 >> 16) & 0xff) * (1 - ratio) + ((c2 >> 16) & 0xff) * ratio));
  const g = Math.round((((c1 >> 8) & 0xff) * (1 - ratio) + ((c2 >> 8) & 0xff) * ratio));
  const b = Math.round(((c1 & 0xff) * (1 - ratio) + (c2 & 0xff) * ratio));
  return (r << 16) | (g << 8) | b;
}

/** 颜色工具：调整亮度，amount > 0 提亮，< 0 压暗 */
export function shade(color: number, amount: number): number {
  return mixColor(color, amount >= 0 ? 0xffffff : 0x000000, Math.abs(amount));
}

/** 颜色工具：转 CSS 十六进制字符串（用于 HTML 输入框等 DOM 元素） */
export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
