import { Text, type TextStyleOptions } from "pixi.js";
import { Color, Font, Size } from "./theme";

export type TextRole =
  | "hero"
  | "title"
  | "sectionTitle"
  | "body"
  | "bodySm"
  | "caption"
  | "micro"
  | "label"
  | "mono";

interface UiTextOptions {
  /** 预设字号/字重/字距组合 */
  role?: TextRole;
  /** 覆盖字号 */
  fontSize?: number;
  /** 覆盖颜色 */
  fill?: number;
  /** 字重 */
  fontWeight?: "normal" | "bold" | "600" | "500";
  /** 是否使用等宽字体（数字、历史记录） */
  mono?: boolean;
  /** 字间距 */
  letterSpacing?: number;
  /** 水平对齐 */
  align?: "left" | "center" | "right";
  /** 自动换行宽度 */
  wordWrapWidth?: number;
  /** 不透明度 */
  alpha?: number;
  /** 发光颜色，默认不发光 */
  glow?: number;
  /** 发光强度，0-1 */
  glowStrength?: number;
}

/** 各预设角色的字号 */
const ROLE_SIZE: Record<TextRole, number> = {
  hero: Size.hero,
  title: Size.title,
  sectionTitle: Size.sectionTitle,
  body: Size.body,
  bodySm: Size.bodySm,
  caption: Size.caption,
  micro: Size.micro,
  label: Size.bodySm,
  mono: Size.bodySm,
};

/**
 * 统一的文本工厂。
 * 收敛了全站的字体、字重、字距与发光规则，避免各处样式不一致。
 */
export function uiText(content: string, opts: UiTextOptions = {}): Text {
  const role = opts.role ?? "body";
  const fontSize = opts.fontSize ?? ROLE_SIZE[role];
  const fill = opts.fill ?? (role === "hero" || role === "title" ? Color.text : Color.textSub);

  const style: TextStyleOptions = {
    fontFamily: opts.mono || role === "mono" ? Font.mono : Font.sans,
    fontSize,
    fill,
    align: opts.align ?? "left",
    fontWeight: opts.fontWeight ?? (isStrongRole(role) ? "bold" : "normal"),
  };

  // 大字号收紧字距，小字号放宽字距 —— 提升可读性与精致度
  style.letterSpacing =
    opts.letterSpacing ??
    (fontSize >= 32 ? -0.8 : role === "label" || role === "caption" ? 0.6 : fontSize >= 20 ? -0.2 : 0);

  if (opts.wordWrapWidth) {
    style.wordWrap = true;
    style.wordWrapWidth = opts.wordWrapWidth;
    style.lineHeight = Math.round(fontSize * 1.45);
    style.breakWords = true;
  }

  if (opts.glow !== undefined) {
    style.dropShadow = {
      color: opts.glow,
      blur: Math.round(fontSize * (opts.glowStrength ?? 0.5)),
      alpha: 0.45 * (opts.glowStrength ?? 1),
      distance: 0,
    };
  }

  const t = new Text({ text: content, style });
  if (opts.alpha !== undefined) t.alpha = opts.alpha;
  return t;
}

function isStrongRole(role: TextRole): boolean {
  return role === "hero" || role === "title" || role === "sectionTitle" || role === "label";
}
