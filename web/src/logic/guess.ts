/** 生成 4 位不重复数字 (0-9) */
export function generateSecret(): string {
  const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 4).join("");
}

/** 判断猜测结果：A=位置数字都对，B=数字对位置错 */
export function evaluate(secret: string, guess: string): { a: number; b: number } {
  let a = 0;
  let b = 0;
  const g = guess.split("");
  const s = secret.split("");
  for (let i = 0; i < 4; i++) {
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

/** 按规则校验：standard=4位不重复，position_only=4位数字可重复 */
export function isValidGuessForRule(guess: string, rule: string): boolean {
  if (guess.length !== 4 || !/^\d{4}$/.test(guess)) return false;
  if (rule === "position_only") return true;
  return new Set(guess.split("")).size === 4;
}
