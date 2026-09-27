import { describe, expect, it } from "vitest";
import {
  evaluate,
  generateSecret,
  generateSecretFromItems,
  isValidGuess,
  isValidGuessForItems,
  isValidGuessForRule,
} from "./guess";
import { ALL_ITEM_TYPES, ITEM_TYPE_DIGITS, ITEM_TYPE_FRUITS } from "@/types/itemTypes";

describe("evaluate · 1A2B 判定", () => {
  it("全对 = 4A0B", () => {
    expect(evaluate("1234", "1234")).toEqual({ a: 4, b: 0 });
  });

  it("全错 = 0A0B", () => {
    expect(evaluate("1234", "5678")).toEqual({ a: 0, b: 0 });
  });

  it("位置对的数量只统计同位相同项", () => {
    // 密码 1 2 3 4，猜测 1 5 2 3
    //   位置 0：1 === 1            → A
    //   位置 1：5 不在密码里        → 无
    //   位置 2：2 在密码里但位置错  → B
    //   位置 3：3 在密码里但位置错  → B
    expect(evaluate("1234", "1523")).toEqual({ a: 1, b: 2 });
  });

  it("多 A 情况", () => {
    expect(evaluate("1234", "1534")).toEqual({ a: 3, b: 0 });
  });

  it("数字对但全错位 = 0A4B", () => {
    expect(evaluate("1234", "2143")).toEqual({ a: 0, b: 4 });
  });

  it("正确处理 emoji（多码点字符）", () => {
    const { a, b } = evaluate("🍎🍊🍋🍌", "🍎🍌🍊🍋");
    expect(a).toBe(1);
    expect(b).toBe(3);
  });
});

describe("generateSecretFromItems · 秘密序列生成", () => {
  it.each(ALL_ITEM_TYPES.map((t) => [t.id, t] as const))(
    "%s：生成 4 个不重复且都在物品集合内的项",
    (_id, itemType) => {
      for (let i = 0; i < 200; i++) {
        const secret = generateSecretFromItems(itemType.items, 4, false);
        const chars = Array.from(secret);
        expect(chars).toHaveLength(4);
        expect(new Set(chars).size).toBe(4);
        for (const ch of chars) expect(itemType.items).toContain(ch);
      }
    }
  );

  it("物品不足且不允许重复时抛错", () => {
    expect(() => generateSecretFromItems(["a", "b"], 4, false)).toThrow();
  });

  it("允许重复时可以取到重复项且不抛错", () => {
    const s = generateSecretFromItems(["a", "b"], 4, true);
    expect(Array.from(s)).toHaveLength(4);
  });

  it("数字键序调整为 1-9,0 后仍能生成 0（回归：重排不得丢项）", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      for (const ch of Array.from(generateSecretFromItems(ITEM_TYPE_DIGITS.items, 4, false))) {
        seen.add(ch);
      }
    }
    expect(seen.size).toBe(10);
    expect(seen.has("0")).toBe(true);
    expect(seen.has("9")).toBe(true);
  });
});

describe("generateSecret · 兼容旧接口", () => {
  it("始终返回 4 位不重复数字", () => {
    for (let i = 0; i < 200; i++) {
      const s = generateSecret();
      expect(s).toMatch(/^\d{4}$/);
      expect(new Set(s.split("")).size).toBe(4);
    }
  });
});

describe("猜测合法性校验", () => {
  it("isValidGuess：4 位不重复数字才合法", () => {
    expect(isValidGuess("1234")).toBe(true);
    expect(isValidGuess("123")).toBe(false);
    expect(isValidGuess("1123")).toBe(false);
    expect(isValidGuess("12a4")).toBe(false);
  });

  it("isValidGuessForItems：数字模式拒绝重复与越界物品", () => {
    const items = ITEM_TYPE_DIGITS.items;
    expect(isValidGuessForItems("1234", items, 4, false)).toBe(true);
    expect(isValidGuessForItems("1123", items, 4, false)).toBe(false);
    expect(isValidGuessForItems("123", items, 4, false)).toBe(false);
    expect(isValidGuessForItems("1234", ["1", "2", "3"], 4, false)).toBe(false);
  });

  it("isValidGuessForItems：水果模式（emoji 按字符计数）", () => {
    const items = ITEM_TYPE_FRUITS.items;
    const guess = items.slice(0, 4).join("");
    expect(isValidGuessForItems(guess, items, 4, false)).toBe(true);
    // 重复使用同一水果在非重复模式下应被拒
    expect(isValidGuessForItems(items[0].repeat(4), items, 4, false)).toBe(false);
  });

  it("isValidGuessForRule：position_only 允许重复数字", () => {
    expect(isValidGuessForRule("1122", "standard")).toBe(false);
    expect(isValidGuessForRule("1122", "position_only")).toBe(true);
    expect(isValidGuessForRule("112", "position_only")).toBe(false);
  });
});

/**
 * 已知限制（不在本次前端重构范围内，仅做行为固化）：
 *
 * `evaluate` 的 B 计数用的是「猜测项是否出现在密码中」的包含判断，
 * 而不是「元素出现次数的多重集交集」。因此**在允许重复数字玩法**
 * （PVP position_only / 自由房 allowRepeat）下会多算 B：
 *   密码 1123，猜测 1111 → 实际应为 2A0B，当前返回 2A2B
 *
 * 之所以不在本次改动里修：A/B 判定在**服务端**也有一份实现
 * （server/src/room/wsHandler.ts），只改客户端会导致双端结论不一致。
 * 修的话必须前后端一起改并同步上线。
 */
describe("evaluate · 重复数字玩法下的已知限制（行为固化）", () => {
  it("非重复玩法（主流模式）判定正确", () => {
    expect(evaluate("1234", "4321")).toEqual({ a: 0, b: 4 });
    expect(evaluate("1234", "1243")).toEqual({ a: 2, b: 2 });
  });

  it("重复数字时会多算 B —— 已记录，需前后端一起修", () => {
    expect(evaluate("1123", "1111")).toEqual({ a: 2, b: 2 }); // 期望应为 2A0B
    expect(evaluate("1122", "2211")).toEqual({ a: 0, b: 4 }); // 这个恰好正确
  });
});
