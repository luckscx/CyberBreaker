/**
 * Player settings manager using cookies
 */

const COOKIE_NICKNAME = "cyberbreaker_nickname";
const DEFAULT_NICKNAME = "玩家";

/**
 * Get player nickname from cookie
 */
export function getNickname(): string {
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    const [key, value] = cookie.split("=");
    if (key === COOKIE_NICKNAME) {
      return decodeURIComponent(value);
    }
  }
  return DEFAULT_NICKNAME;
}

/**
 * Set player nickname to cookie (expires in 1 year)
 */
export function setNickname(nickname: string): void {
  const trimmed = nickname.trim();
  if (!trimmed) {
    return;
  }

  // Set cookie to expire in 1 year
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  document.cookie = `${COOKIE_NICKNAME}=${encodeURIComponent(trimmed)}; expires=${expires.toUTCString()}; path=/`;
}

/**
 * Validate nickname (2-10 characters)
 */
export function validateNickname(nickname: string): { valid: boolean; error?: string } {
  const trimmed = nickname.trim();

  if (!trimmed) {
    return { valid: false, error: "昵称不能为空" };
  }

  if (trimmed.length < 2) {
    return { valid: false, error: "昵称至少2个字符" };
  }

  if (trimmed.length > 10) {
    return { valid: false, error: "昵称最多10个字符" };
  }

  return { valid: true };
}
