/**
 * 布局计算与环境探测。
 *
 * 全站唯一的玩法区几何来源：
 *   - 键盘 / 输入槽尺寸只在这里算一次，GuessInput 与各场景都从这里取。
 *   - 布局自下而上（键盘贴底），保证再矮的屏幕也不会把键盘挤出可视区。
 *
 * 这里同时提供安全区（刘海 / Home Indicator）与尺寸变化订阅，
 * 让场景可以在手机翻转或地址栏收起后重建布局，而不是沿用旧坐标。
 */
import type { ItemType } from "@/types/itemTypes";
import { Play, Screen, Touch } from "./theme";

/** 屏幕逻辑尺寸（CSS px） */
export interface Viewport {
  width: number;
  height: number;
}

export interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 玩法区几何：由屏幕宽度与物品类型唯一决定 */
export interface PlayGeometry {
  /** 内容区可用宽度（已扣除安全边距并做最大宽度限制） */
  contentW: number;
  /** 内容区左边界（居中后的起点） */
  contentLeft: number;
  /** 行 / 列数 */
  cols: number;
  rows: number;
  /** 单个按键边长 */
  keySize: number;
  /** 按键间距 */
  keyGap: number;
  /** 键盘总宽 / 总高 */
  keypadW: number;
  keypadH: number;
  /** 退格 / 确认 是否与最后一行按键同排（电话式数字键盘为 true，可省一整行） */
  inlineActions: boolean;
  /** 输入槽边长（与键盘等宽对齐） */
  slotSize: number;
  slotGap: number;
  slotRowH: number;
  /** 4 个槽的总宽（应当等于 keypadW，容差 ≤3px 由 floor 引起） */
  slotRowW: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * 计算玩法区几何。
 *
 * 输入槽与键盘**强制等宽**：槽宽不再由调用方随意指定，
 * 而是从键盘宽度反推，从而杜绝「槽比键盘宽 / 窄」的错位。
 */
export function computePlayGeometry(screenW: number, itemType: ItemType): PlayGeometry {
  const padX = Screen.padX;
  const contentW = Math.min(screenW - padX * 2, Screen.maxContentWidth);
  const contentLeft = (screenW - contentW) / 2;

  const cols = Math.max(1, itemType.ui.columns);
  const keyGap = Play.gap;
  const keySize = clamp(
    Math.floor((contentW - (cols - 1) * keyGap) / cols),
    Touch.minKey,
    Touch.maxKey
  );

  const itemCount = itemType.items.length;
  const rows = Math.ceil(itemCount / cols);
  const emptyCells = rows * cols - itemCount;
  // 最后一行若有 ≥2 个空位，就把 ⌫ / ✓ 放进去，省掉整整一行的高度
  const inlineActions = emptyCells >= 2;

  const keypadW = cols * keySize + (cols - 1) * keyGap;
  const keypadH = inlineActions
    ? rows * (keySize + keyGap) - keyGap
    : rows * (keySize + keyGap) + keySize;

  const slotGap = Play.gap + 2;
  // 槽与键盘**严格等宽**：槽大小从键盘宽度反推。
  // 注意：输入槽是只读展示区，不承担点击，因此不受 Touch.minTarget 约束
  //（旧实现把槽夹到 48 后比键盘还宽，两者无法对齐）。只保一个可读下限。
  const slotMin = 34;
  const slotSize = Math.max(slotMin, Math.floor((keypadW - 3 * slotGap) / 4));
  const slotRowW = 4 * slotSize + 3 * slotGap;

  return {
    contentW,
    contentLeft,
    cols,
    rows,
    keySize,
    keyGap,
    keypadW,
    keypadH,
    inlineActions,
    slotSize,
    slotGap,
    slotRowH: slotSize,
    slotRowW,
  };
}

/** 读取环境安全区（刘海屏 / Home Indicator），非浏览器环境返回 0 */
export function readSafeArea(): SafeArea {
  if (typeof document === "undefined") return { top: 0, bottom: 0, left: 0, right: 0 };
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:-9999px;top:0;width:0;height:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const px = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const area: SafeArea = {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
  probe.remove();
  return area;
}

/**
 * 订阅屏幕尺寸变化（手机旋转、地址栏收起、软键盘弹出）。
 * 返回取消订阅函数。
 */
export function observeResize(cb: (v: Viewport) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    // 防抖：移动端旋转会连续触发多次
    timer = setTimeout(() => {
      cb({ width: window.innerWidth, height: window.innerHeight });
    }, 120);
  };
  window.addEventListener("resize", fire);
  window.addEventListener("orientationchange", fire);
  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener("resize", fire);
    window.removeEventListener("orientationchange", fire);
  };
}

/** 轻量触感反馈（支持的机型才生效，失败静默） */
export function haptic(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 忽略：桌面端 / 无权限 */
  }
}

// ════════════════════════════════════════════════════════════
//  历史行 / 结果条的纯几何计算
//
//  抽成不依赖 Pixi 的纯函数，原因有二：
//    1. 这两处正是旧实现出问题的地方（A/B 徽章溢出到行背景之外），
//       纯函数可以直接写断言把「绝不越界」钉死，而不需要跑 WebGL。
//    2. 极窄屏下自动收缩方块尺寸，保证任何宽度都不会重叠。
// ════════════════════════════════════════════════════════════

/** 历史行的行内几何 */
export interface GuessRowLayout {
  rowH: number;
  /** 序号所在列的宽度 */
  indexW: number;
  /** 方块边长（窄屏会自动收缩） */
  chipSize: number;
  chipGap: number;
  /** 第 i 个方块的中心 x */
  chipCenters: number[];
  /** 4 个方块的左 / 右边界 */
  chipsLeft: number;
  chipsRight: number;
  /** A / B 徽章中心 x 与半径 */
  aBadgeX: number;
  bBadgeX: number;
  badgeR: number;
  /** 徽章整体右边界（必须 ≤ rowW） */
  badgesRight: number;
  /** A 徽章左边界（必须 > chipsRight） */
  badgesLeft: number;
}

/**
 * 计算一行历史记录的内部布局。
 *
 * 关键不变量（有单测保护）：
 *   badgesRight <= rowW          → 徽章绝不越出行背景
 *   badgesLeft > chipsRight      → 方块与徽章绝不重叠
 */
export function computeGuessRowLayout(rowW: number): GuessRowLayout {
  const indexW = 24;
  const padRight = 8;
  const chipGap = Play.chipGap;
  const badgeR = Play.badgeRadius;
  const badgeW = badgeR * 2;
  const badgeGap = 6;
  const chipsLeft = indexW + 6;
  // 方块区右边界：给「间隙 + 两个徽章 + 右侧内边距」先留够位置
  const reserveRight = 6 + badgeW * 2 + badgeGap + padRight;
  const chipMax = Math.floor((rowW - chipsLeft - reserveRight - 3 * chipGap) / 4);
  const chipSize = Math.max(16, Math.min(Play.chipSize, chipMax));

  const chipCenters: number[] = [];
  for (let i = 0; i < 4; i++) {
    chipCenters.push(chipsLeft + chipSize / 2 + i * (chipSize + chipGap));
  }
  const chipsRight = chipsLeft + 4 * chipSize + 3 * chipGap;

  const bBadgeX = rowW - padRight - badgeR;
  const aBadgeX = bBadgeX - badgeW - badgeGap;

  return {
    rowH: Play.rowHeight,
    indexW,
    chipSize,
    chipGap,
    chipCenters,
    chipsLeft,
    chipsRight,
    aBadgeX,
    bBadgeX,
    badgeR,
    badgesRight: bBadgeX + badgeR,
    badgesLeft: aBadgeX - badgeR,
  };
}

/** 结果条（ResultBanner）的条内几何 */
export interface ResultStripLayout {
  chipSize: number;
  chipGap: number;
  chipCenters: number[];
  arrowW: number;
  arrowX: number;
  aBadgeX: number;
  bBadgeX: number;
  badgeR: number;
  /** 内容总宽（用于整体居中） */
  contentW: number;
  /** 内容左边界 */
  startX: number;
  /** 内容右边界（必须 ≤ stripW） */
  endX: number;
}

/**
 * 计算结果条内容的位置，并整体水平居中。
 * 采用「先排布 → 量总宽 → 再整体居中」的做法，
 * 避免手写 total 公式与实际排布不一致导致的内容偏右。
 */
export function computeResultStripLayout(stripW: number, stripH: number): ResultStripLayout {
  const chipGap = Play.chipGap;
  const badgeR = Play.badgeRadius;
  const badgeW = badgeR * 2;
  const arrowW = 16;
  const gap = 10;
  const badgeGap = 6;
  const fixed = 3 * chipGap + gap + arrowW + gap + badgeW + badgeGap + badgeW;

  const chipByHeight = stripH - 12;
  const chipByWidth = Math.floor((stripW - fixed) / 4);
  const chipSize = Math.max(14, Math.min(Play.chipSize, chipByHeight, chipByWidth));

  const contentW = 4 * chipSize + fixed;
  const startX = Math.max(0, (stripW - contentW) / 2);

  const chipCenters: number[] = [];
  for (let i = 0; i < 4; i++) {
    chipCenters.push(startX + chipSize / 2 + i * (chipSize + chipGap));
  }
  const chipsEnd = startX + 4 * chipSize + 3 * chipGap;
  const arrowX = chipsEnd + gap + arrowW / 2;
  const badgesStart = arrowX + arrowW / 2 + gap;
  const aBadgeX = badgesStart + badgeR;
  const bBadgeX = aBadgeX + badgeW + badgeGap;
  const endX = bBadgeX + badgeR;

  return {
    chipSize,
    chipGap,
    chipCenters,
    arrowW,
    arrowX,
    aBadgeX,
    bBadgeX,
    badgeR,
    contentW,
    startX,
    endX,
  };
}

/** 场景内容区边界（由 SceneChrome 提供） */
export interface ContentBox {
  contentLeft: number;
  contentRight: number;
  contentTop: number;
  contentBottom: number;
}

export interface PlayScreenLayout {
  /** 顶部状态条（计时 / 次数 / 道具），高度为 0 表示不占位 */
  stats: { y: number; h: number };
  /** 历史板区域 */
  board: { x: number; y: number; w: number; h: number };
  /** 结果条带（永远在键盘之上，绝不遮挡可点区域） */
  result: { y: number; h: number };
  /** 输入块（槽 + 键盘）顶部与键盘顶部 */
  inputTop: number;
  keypadTop: number;
  /** 键盘底部（等于 contentBottom） */
  keypadBottom: number;
  /** 内容区水平中心 */
  centerX: number;
}

/**
 * 玩法页统一分区布局（自下而上排布）。
 *
 * 顺序：状态条 → 历史板（自适应剩余高度）→ 结果条带 → 输入槽 → 键盘（贴底）。
 *
 * 之所以「自下而上」，是因为键盘必须留在拇指区且不能被挤出屏幕：
 * 旧实现从顶部往下累加绝对坐标，在 667px 高的手机上历史与结果直接跑到屏幕外。
 * 现在无论屏幕多矮，键盘先占位，历史板吃剩下的空间（最少也会保留 1 行高度）。
 */
export function computePlayScreen(args: {
  chrome: ContentBox;
  geometry: PlayGeometry;
  showSlots: boolean;
  /** 顶部状态条高度，默认 0 */
  statsH?: number;
  /**
   * 状态条与历史板之间额外占位的高度（如联机页的「我方/对方」分段控件）。
   * 默认 0。历史板会自动吃掉因此减少的高度，不会与控件重叠。
   */
  topExtraH?: number;
  /** 结果条带高度，默认 40 */
  resultH?: number;
  /** 历史板与结果条带之间的间距 */
  gap?: number;
}): PlayScreenLayout {
  const { chrome, geometry: g } = args;
  const showSlots = args.showSlots;
  const statsH = args.statsH ?? 0;
  const topExtraH = args.topExtraH ?? 0;
  const resultH = args.resultH ?? 40;
  const gap = args.gap ?? 8;

  const centerX = (chrome.contentLeft + chrome.contentRight) / 2;
  const keypadBottom = chrome.contentBottom;
  const keypadTop = keypadBottom - g.keypadH;

  const inputTop = showSlots ? keypadTop - Play.slotToKeypad - g.slotRowH : keypadTop;
  const resultBottom = inputTop - gap;
  const resultY = resultBottom - resultH;

  const statsY = chrome.contentTop;
  const boardTop =
    chrome.contentTop +
    (statsH > 0 ? statsH + gap : 0) +
    (topExtraH > 0 ? topExtraH : 0);
  const boardBottom = resultY - gap;
  // 至少留出「表头 + 一行记录」的高度，否则历史完全不可用
  const boardH = Math.max(70, boardBottom - boardTop);

  // 历史板用满内容宽度（比键盘宽）：
  // 一行要放「序号 + 4 个方块 + A/B 徽章」，若限制到键盘宽度（214px）
  // 第 4 个方块会和 A 徽章叠在一起。键盘保持自身宽度居中即可。
  const boardW = chrome.contentRight - chrome.contentLeft;
  const boardX = centerX - boardW / 2;

  return {
    stats: { y: statsY, h: statsH },
    board: { x: boardX, y: boardTop, w: boardW, h: boardH },
    result: { y: resultY, h: resultH },
    inputTop,
    keypadTop,
    keypadBottom,
    centerX,
  };
}
