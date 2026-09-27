import { describe, expect, it } from "vitest";
import {
  ALL_ITEM_TYPES,
  DEFAULT_ITEM_TYPE,
  ITEM_TYPE_DIGITS,
  getItemTypeById,
} from "./itemTypes";
import { computePlayGeometry } from "@/ui/layout";

describe("ItemType 配置不变量", () => {
  it("至少提供数字与水果两种类型，且默认是数字", () => {
    expect(ALL_ITEM_TYPES.length).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_ITEM_TYPE.id).toBe("digits");
  });

  it.each(ALL_ITEM_TYPES.map((t) => [t.id, t] as const))(
    "%s：物品唯一、列数合法、物品数不少于 4",
    (_id, t) => {
      expect(new Set(t.items).size).toBe(t.items.length);
      expect(t.ui.columns).toBeGreaterThanOrEqual(1);
      expect(t.items.length).toBeGreaterThanOrEqual(4);
    }
  );

  /**
   * 键盘布局把「⌫ / ✓」塞进最后一行的空位来省掉一整行。
   * 这要求 物品数 % 列数 之后至少剩 2 个空位，即空位数 ∈ {0} ∪ [2, 列数-1]。
   * 若某个物品类型刚好只剩 1 个空位，动作键就要另起一行 —— 这是允许的，
   * 但不能出现「空位够放 2 个却只放 1 个」的浪费。
   */
  it.each(ALL_ITEM_TYPES.map((t) => [t.id, t] as const))(
    "%s：键盘几何与物品数自洽（无空洞、无越界）",
    (_id, t) => {
      const g = computePlayGeometry(390, t);
      const expectedRows = Math.ceil(t.items.length / g.cols);
      expect(g.rows).toBe(expectedRows);

      const emptyCells = g.rows * g.cols - t.items.length;
      expect(g.inlineActions).toBe(emptyCells >= 2);

      const totalRows = g.inlineActions ? g.rows : g.rows + 1;
      expect(g.keypadH).toBe(totalRows * (g.keySize + g.keyGap) - g.keyGap);

      // 动作键必须放得下：内联时空位数 ≥2；另起一行时该行至少要有 2 列
      if (g.inlineActions) {
        expect(emptyCells).toBeGreaterThanOrEqual(2);
      } else {
        expect(g.cols).toBeGreaterThanOrEqual(2);
      }
    }
  );

  it("数字类型的键序为 1-9 后接 0（拨号盘式，0 落在最后一行）", () => {
    expect(ITEM_TYPE_DIGITS.items.slice(0, 9)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8", "9",
    ]);
    expect(ITEM_TYPE_DIGITS.items[9]).toBe("0");
  });

  it("getItemTypeById 能取到已知类型，未知 id 返回 undefined", () => {
    expect(getItemTypeById("digits")?.name).toBe("数字");
    expect(getItemTypeById("nope")).toBeUndefined();
  });
});
