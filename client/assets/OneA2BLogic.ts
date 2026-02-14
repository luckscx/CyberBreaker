/**
 * 1A2B 核心逻辑，无 Cocos 依赖，便于单测与幽灵对局复用。
 */
const DIGITS = '0123456789';

export function generateSecret(): string {
  const arr = DIGITS.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 4).join('');
}

export function evaluate(secret: string, guess: string): string {
  if (guess.length !== 4) return '';
  const set = new Set(guess);
  if (set.size !== 4) return '';
  let a = 0, b = 0;
  for (let i = 0; i < 4; i++) {
    if (secret[i] === guess[i]) a++;
    else if (secret.includes(guess[i])) b++;
  }
  return `${a}A${b}B`;
}
