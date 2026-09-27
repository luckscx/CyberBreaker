/**
 * 物品类型配置系统
 * 支持数字、水果等任何可猜测的物品集合
 */

export interface ItemType {
  /** 唯一标识符 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 物品列表（数字为字符串，水果为 emoji） */
  items: string[];
  /**
   * UI 配置。
   *
   * 注意：除 `columns` 外，尺寸字段（slotSize / keySize / fontSize / slotFontSize）
   * 自本次重构起**不再生效**。玩法区几何统一由 `@/ui/layout.ts` 的
   * `computePlayGeometry()` 依据屏幕宽度推算，以保证全站一致 + 移动端可点面积达标。
   * 字段保留仅为兼容既有数据与外部引用，新代码不要读取它们。
   */
  ui: {
    /** @deprecated 见上，改为 computePlayGeometry() 推算 */
    slotSize: number;
    /** @deprecated 见上，改为 computePlayGeometry() 推算 */
    keySize: number;
    /** @deprecated 见上，改为 computePlayGeometry() 推算 */
    fontSize: number;
    /** @deprecated 见上，改为 computePlayGeometry() 推算 */
    slotFontSize: number;
    /** 每行列数（唯一仍参与布局计算的字段） */
    columns: number;
  };
  /** 游戏规则说明 */
  rules: string;
  /** 是否允许重复（默认 false） */
  allowRepeat?: boolean;
}

/** 数字类型配置 */
export const ITEM_TYPE_DIGITS: ItemType = {
  id: "digits",
  name: "数字",
  // 顺序即键盘顺序：1-9 铺满 3×3 后 0 落在最后一行中间，
  // 与所有手机拨号盘一致，且能顺带把 ⌫ / ✓ 放进最后一行两侧（省一整行高度）。
  items: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ui: {
    slotSize: 48,
    keySize: 54,
    fontSize: 22,
    slotFontSize: 20,
    columns: 3,
  },
  rules: "🎯 4位不重复  💡 A=位置对 B=数字对位置错",
  allowRepeat: false,
};

/** 水果类型配置 */
export const ITEM_TYPE_FRUITS: ItemType = {
  id: "fruits",
  name: "水果",
  items: ["🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐"],
  ui: {
    slotSize: 56,
    keySize: 62,
    fontSize: 28,
    slotFontSize: 32,
    columns: 4,
  },
  rules: "🎯 4个不重复  💡 A=位置对 B=水果对位置错",
  allowRepeat: false,
};

/** 所有可用的物品类型 */
export const ALL_ITEM_TYPES: ItemType[] = [
  ITEM_TYPE_DIGITS,
  ITEM_TYPE_FRUITS,
];

/** 根据 ID 获取物品类型 */
export function getItemTypeById(id: string): ItemType | undefined {
  return ALL_ITEM_TYPES.find((t) => t.id === id);
}

/** 默认物品类型（数字） */
export const DEFAULT_ITEM_TYPE = ITEM_TYPE_DIGITS;
