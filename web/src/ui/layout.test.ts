import { describe, expect, it } from "vitest";
import { ALL_ITEM_TYPES, ITEM_TYPE_DIGITS, ITEM_TYPE_FRUITS } from "@/types/itemTypes";
import { Play, Screen, Touch } from "@/ui/theme";
import {
  computeGuessRowLayout,
  computePlayGeometry,
  computePlayScreen,
  computeResultStripLayout,
  type ContentBox,
} from "@/ui/layout";

/** 常见手机逻辑宽度（CSS px） */
const WIDTHS = [320, 360, 375, 390, 414, 430];
/** 常见手机逻辑高度 —— 667 是 iPhone SE 这类矮屏，旧实现会在此溢出 */
const HEIGHTS = [568, 600, 667, 736, 812, 844, 926];

describe("computePlayGeometry · 键盘几何", () => {
  it("数字键盘：3 列 4 行，退格/确认内联进最后一行（省掉一整行）", () => {
    const g = computePlayGeometry(390, ITEM_TYPE_DIGITS);
    expect(g.cols).toBe(3);
    expect(g.rows).toBe(4);
    expect(g.inlineActions).toBe(true);
    // 10 个物品 + 2 个动作键刚好铺满 4×3，不额外占行
    expect(g.keypadH).toBe(4 * (g.keySize + g.keyGap) - g.keyGap);
  });

  it("水果键盘：4 列且铺满，动作键另起一行", () => {
    const g = computePlayGeometry(390, ITEM_TYPE_FRUITS);
    expect(g.cols).toBe(4);
    expect(g.rows).toBe(2);
    expect(g.inlineActions).toBe(false);
    // 2 行物品 + 1 行动作键
    expect(g.keypadH).toBe(2 * (g.keySize + g.keyGap) + g.keySize);
  });

  it.each(WIDTHS)("屏幕宽 %ipx：所有按键都达到最小可点尺寸", (w) => {
    for (const t of ALL_ITEM_TYPES) {
      const g = computePlayGeometry(w, t);
      expect(g.keySize, `${t.id}@${w}`).toBeGreaterThanOrEqual(Touch.minKey);
      expect(g.keySize, `${t.id}@${w}`).toBeLessThanOrEqual(Touch.maxKey);
    }
  });

  it.each(WIDTHS)("屏幕宽 %ipx：键盘不会超出内容区", (w) => {
    for (const t of ALL_ITEM_TYPES) {
      const g = computePlayGeometry(w, t);
      expect(g.keypadW, `${t.id}@${w}`).toBeLessThanOrEqual(g.contentW + 0.001);
    }
  });

  it.each(WIDTHS)("屏幕宽 %ipx：输入槽与键盘等宽对齐（回归：旧版槽比键盘宽）", (w) => {
    for (const t of ALL_ITEM_TYPES) {
      const g = computePlayGeometry(w, t);
      // floor 会带来最多 3px 的余量，超出即说明又回到「槽比键盘宽」的老问题
      expect(Math.abs(g.slotRowW - g.keypadW), `${t.id}@${w}`).toBeLessThanOrEqual(3);
    }
  });

  it("宽屏上内容区被限制最大宽度并居中", () => {
    const g = computePlayGeometry(1200, ITEM_TYPE_DIGITS);
    expect(g.contentW).toBeLessThanOrEqual(Screen.maxContentWidth);
    expect(g.contentLeft).toBeCloseTo((1200 - g.contentW) / 2, 5);
  });
});

describe("computePlayScreen · 分区布局", () => {
  const chromeOf = (w: number, h: number): ContentBox => ({
    contentLeft: Screen.padX,
    contentRight: w - Screen.padX,
    contentTop: Screen.topBar,
    contentBottom: h - Screen.padBottom,
  });

  const cases = HEIGHTS.flatMap((h) => WIDTHS.map((w) => ({ w, h })));

  it.each(cases)("$w×$h：键盘贴底，历史板/结果条/槽位互不重叠且顺序正确", ({ w, h }) => {
    const g = computePlayGeometry(w, ITEM_TYPE_DIGITS);
    const L = computePlayScreen({ chrome: chromeOf(w, h), geometry: g, showSlots: true });

    // 键盘必须贴住内容区底部（旧实现从上往下累加，矮屏会掉出屏幕）
    expect(L.keypadTop + g.keypadH).toBeCloseTo(L.keypadBottom, 5);
    expect(L.keypadBottom).toBeCloseTo(h - Screen.padBottom, 5);

    // 自下而上的顺序：槽 → 结果条 → 历史板 → 状态条
    expect(L.inputTop).toBeLessThanOrEqual(L.keypadTop);
    expect(L.result.y + L.result.h).toBeLessThanOrEqual(L.inputTop + 0.001);
    expect(L.board.y + L.board.h).toBeLessThanOrEqual(L.result.y + 0.001);
    expect(L.board.y).toBeGreaterThanOrEqual(Screen.topBar);

    // 历史板至少能显示「表头 + 一行」，否则历史不可用
    expect(L.board.h).toBeGreaterThanOrEqual(70);

    // 所有内容都在屏幕内
    expect(L.keypadBottom).toBeLessThanOrEqual(h);
    expect(L.board.y).toBeGreaterThanOrEqual(0);
    expect(L.board.x).toBeGreaterThanOrEqual(0);
    expect(L.board.x + L.board.w).toBeLessThanOrEqual(w + 0.001);
  });

  it("结果条必须位于键盘之上（回归：旧版结果卡片浮在键盘上并导致点击穿透）", () => {
    const w = 390;
    const h = 844;
    const g = computePlayGeometry(w, ITEM_TYPE_DIGITS);
    const L = computePlayScreen({ chrome: chromeOf(w, h), geometry: g, showSlots: true });
    // 结果条底部严格高于键盘顶部
    expect(L.result.y + L.result.h).toBeLessThan(L.keypadTop);
  });

  it("topExtraH（如分段控件）会把历史板下推且不与其重叠", () => {
    const w = 390;
    const h = 844;
    const g = computePlayGeometry(w, ITEM_TYPE_DIGITS);
    const base = computePlayScreen({ chrome: chromeOf(w, h), geometry: g, showSlots: true, statsH: 46 });
    const withExtra = computePlayScreen({
      chrome: chromeOf(w, h),
      geometry: g,
      showSlots: true,
      statsH: 46,
      topExtraH: 42,
    });
    expect(withExtra.board.y).toBeCloseTo(base.board.y + 42, 5);
    expect(withExtra.board.h).toBeCloseTo(base.board.h - 42, 5);
    // 下推后底部各区块位置不变（只有历史板被压缩）
    expect(withExtra.result.y).toBeCloseTo(base.result.y, 5);
    expect(withExtra.keypadTop).toBeCloseTo(base.keypadTop, 5);
  });

  it("顶部状态条会把历史板整体下推，不与状态条重叠", () => {
    const w = 390;
    const h = 844;
    const g = computePlayGeometry(w, ITEM_TYPE_DIGITS);
    const noStats = computePlayScreen({ chrome: chromeOf(w, h), geometry: g, showSlots: true });
    const withStats = computePlayScreen({
      chrome: chromeOf(w, h),
      geometry: g,
      showSlots: true,
      statsH: 46,
    });
    expect(withStats.board.y).toBeGreaterThanOrEqual(noStats.board.y + 46);
    expect(withStats.board.h).toBeLessThan(noStats.board.h);
  });
});

describe("computeGuessRowLayout · 历史行（原始 bug 的回归测试）", () => {
  const rowWidths = [180, 200, 240, 268, 288, 320, 338, 358, 400, 480];

  it.each(rowWidths)("行宽 %ipx：A/B 徽章绝不越出行背景右边缘", (rowW) => {
    const L = computeGuessRowLayout(rowW);
    expect(L.badgesRight).toBeLessThanOrEqual(rowW);
  });

  /**
   * 旧实现把行背景画在 x∈[-130, -4]（宽 126），而 A 徽章中心固定在 x=0、
   * B 徽章固定在 x=26、半径 9 → 两个徽章整块悬在背景之外。
   * 这就是「历史结果展示不清晰」的直接原因：徽章位置与行宽完全无关。
   *
   * 这里把这个几何事实固化成断言；下面再断言新实现对任意行宽都成立。
   */
  it("旧实现几何：徽章按固定偏移绘制，必然越出行背景", () => {
    // 旧行背景：x ∈ [-130, -4]
    const OLD_BAR_RIGHT = -4;
    const BADGE_R = 9;

    // A 徽章中心 0 → 右缘 9，越出背景右缘 -4
    expect(0 + BADGE_R).toBeGreaterThan(OLD_BAR_RIGHT);
    // B 徽章中心 26 → 左缘 17，整块都在背景之外
    expect(26 - BADGE_R).toBeGreaterThan(OLD_BAR_RIGHT);
  });

  // 注意：computeGuessRowLayout 的参数**就是行背景宽度**（= 板宽 - 左右内边距），
  // 因此这里直接用它做边界，不再二次扣减内边距。
  it.each(rowWidths)("新实现：行背景宽 %ipx 下徽章完全在行内", (rowW) => {
    const L = computeGuessRowLayout(rowW);
    expect(L.bBadgeX + L.badgeR).toBeLessThanOrEqual(rowW);
    expect(L.aBadgeX - L.badgeR).toBeGreaterThanOrEqual(0);
  });

  it.each(rowWidths)("行宽 %ipx：方块与徽章不重叠，且都在行内", (rowW) => {
    const L = computeGuessRowLayout(rowW);
    expect(L.badgesLeft).toBeGreaterThanOrEqual(L.chipsRight);
    expect(L.chipsLeft).toBeGreaterThanOrEqual(0);
    expect(L.chipsRight).toBeLessThanOrEqual(rowW);
    expect(L.bBadgeX).toBeGreaterThan(L.aBadgeX);
  });

  it("4 个方块中心严格递增且不重叠", () => {
    const L = computeGuessRowLayout(358);
    expect(L.chipCenters).toHaveLength(4);
    for (let i = 1; i < 4; i++) {
      expect(L.chipCenters[i]).toBeGreaterThan(L.chipCenters[i - 1]);
      const gapBetween = L.chipCenters[i] - L.chipCenters[i - 1] - L.chipSize;
      expect(gapBetween).toBeCloseTo(L.chipGap, 5);
    }
  });
});

describe("computeResultStripLayout · 结果条", () => {
  it("内容整体水平居中", () => {
    const L = computeResultStripLayout(358, 40);
    expect(Math.abs(L.startX - (358 - L.endX))).toBeLessThanOrEqual(0.001);
  });

  it.each([180, 214, 240, 288, 320, 358])("条宽 %ipx：内容不越界", (stripW) => {
    const L = computeResultStripLayout(stripW, 40);
    expect(L.startX).toBeGreaterThanOrEqual(0);
    expect(L.endX).toBeLessThanOrEqual(stripW + 0.001);
  });

  it("排布顺序：4 方块 → 箭头 → A 徽章 → B 徽章，互不重叠", () => {
    const L = computeResultStripLayout(358, 40);
    const lastChipRight = L.chipCenters[3] + L.chipSize / 2;
    expect(lastChipRight).toBeLessThanOrEqual(L.arrowX - L.arrowW / 2 + 0.001);
    expect(L.arrowX + L.arrowW / 2).toBeLessThanOrEqual(L.aBadgeX - L.badgeR + 0.001);
    expect(L.aBadgeX + L.badgeR).toBeLessThanOrEqual(L.bBadgeX - L.badgeR + 0.001);
  });

  it("方块不会因条太矮而超过条高", () => {
    const L = computeResultStripLayout(358, 30);
    expect(L.chipSize).toBeLessThanOrEqual(30 - 12);
    expect(L.chipSize).toBeGreaterThanOrEqual(14);
  });
});

describe("设计令牌一致性", () => {
  it("历史板行高足够容纳方块与徽章", () => {
    expect(Play.rowHeight).toBeGreaterThanOrEqual(Play.chipSize + 12);
    expect(Play.rowHeight).toBeGreaterThanOrEqual(Play.badgeRadius * 2 + 12);
  });

  it("可点尺寸下限符合移动端建议（≥44pt）", () => {
    expect(Touch.minKey).toBeGreaterThanOrEqual(44);
    expect(Touch.minTarget).toBeGreaterThanOrEqual(44);
    expect(Touch.cancelSlop).toBeGreaterThan(0);
  });
});
