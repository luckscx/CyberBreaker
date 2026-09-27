/** 生成 4 位不重复数字 (0-9) */
export function generateSecret(): string {
  const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 4).join("");
}

/**
 * 生成秘密序列（支持任意物品集合）
 * @param items 可用物品数组（如数字["0"-"9"]或水果["🍎","🍊"...]）
 * @param length 序列长度（默认 4）
 * @param allowRepeat 是否允许重复（默认 false）
 */
export function generateSecretFromItems(
  items: string[],
  length = 4,
  allowRepeat = false
): string {
  if (!allowRepeat && items.length < length) {
    throw new Error(`Items count (${items.length}) < required length (${length})`);
  }

  const result: string[] = [];
  const available = [...items];

  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * available.length);
    result.push(available[idx]);
    if (!allowRepeat) {
      available.splice(idx, 1); // 移除已选物品
    }
  }

  return result.join("");
}

/**
 * 判断猜测结果：A=位置物品都对，B=物品对位置错
 * 支持数字、emoji 等任意字符序列
 *
 * 注意：对于 emoji，需要正确分割字符（某些 emoji 由多个 Unicode 码点组成）
 */
export function evaluate(secret: string, guess: string): { a: number; b: number } {
  let a = 0;
  let b = 0;
  // 使用 Array.from 正确处理 emoji 等 Unicode 字符
  const g = Array.from(guess);
  const s = Array.from(secret);
  const len = Math.min(g.length, s.length);

  for (let i = 0; i < len; i++) {
    if (g[i] === s[i]) a++;
    else if (s.includes(g[i])) b++;
  }
  return { a, b };
}

export function isValidGuess(guess: string): boolean {
  if (guess.length !== 4) return false;
  const set = new Set(guess.split(""));
  return set.size === 4 && /^\d{4}$/.test(guess);
}

/**
 * 验证猜测是否有效（支持任意物品类型）
 * @param guess 猜测字符串
 * @param validItems 有效物品集合
 * @param length 要求长度（默认 4）
 * @param allowRepeat 是否允许重复（默认 false）
 */
export function isValidGuessForItems(
  guess: string,
  validItems: string[],
  length = 4,
  allowRepeat = false
): boolean {
  const items = Array.from(guess);
  if (items.length !== length) return false;

  // 检查每个物品是否在有效集合中
  for (const item of items) {
    if (!validItems.includes(item)) return false;
  }

  // 检查是否有重复
  if (!allowRepeat && new Set(items).size !== items.length) {
    return false;
  }

  return true;
}

/** 按规则校验：standard=4位不重复，position_only=4位数字可重复 */
export function isValidGuessForRule(guess: string, rule: string): boolean {
  if (guess.length !== 4 || !/^\d{4}$/.test(guess)) return false;
  if (rule === "position_only") return true;
  return new Set(guess.split("")).size === 4;
}

/**
 * 解析联机对战里服务端下发的 A/B 文本结果。
 *
 * 服务端在不同规则下下发的字符串形态不同：
 *   standard      → "1A2B"
 *   position_only → "1A"      （只反馈位置正确个数，没有 B）
 *   平局/异常     → ""        （解析失败应返回 null，由调用方决定如何展示）
 *
 * 之所以单独抽成纯函数：联机场景的历史记录现在要结构化成
 * {guess, a, b} 才能交给 GuessBoard 渲染，解析错了会静默显示成 "0A0B"，
 * 比直接报错更难发现，所以这里单测覆盖。
 */
export function parseAbResult(result: string | null | undefined): { a: number; b: number } | null {
  if (!result) return null;
  const s = String(result).trim();
  if (!s) return null;

  const aMatch = s.match(/(\d+)\s*A/i);
  const bMatch = s.match(/(\d+)\s*B/i);
  // 至少要出现一个 A 或 B 才认为这是合法结果串
  if (!aMatch && !bMatch) return null;

  const a = aMatch ? Number(aMatch[1]) : 0;
  const b = bMatch ? Number(bMatch[1]) : 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  // 位置正确数不可能超过 4
  if (a > 4 || b > 4) return null;

  return { a, b };
}
