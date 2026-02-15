/**
 * UUID 工具 - 基于 Cookie 的用户唯一标识管理
 *
 * 功能：
 * - 自动生成 UUID v4
 * - 静默存储到 Cookie (有效期 365 天)
 * - 跨会话持久化
 */

const COOKIE_NAME = "cyber_breaker_uuid";
const COOKIE_MAX_AGE_DAYS = 365;

/**
 * 生成 UUID v4 (符合 RFC 4122 标准)
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 从 Cookie 中读取指定键值
 */
function getCookie(name: string): string | null {
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    const [key, value] = cookie.split("=");
    if (key === name) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * 设置 Cookie
 */
function setCookie(name: string, value: string, days: number): void {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  const cookieStr = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
  document.cookie = cookieStr;
}

/**
 * 获取或生成用户 UUID
 *
 * 首次调用时自动生成 UUID 并存储到 Cookie
 * 后续调用返回已存在的 UUID
 *
 * @returns 用户的唯一标识符
 */
export function getUserUUID(): string {
  // 尝试从 Cookie 读取
  let uuid = getCookie(COOKIE_NAME);

  // 如果不存在，生成新的 UUID
  if (!uuid) {
    uuid = generateUUID();
    setCookie(COOKIE_NAME, uuid, COOKIE_MAX_AGE_DAYS);
    console.log(`[UUID] 生成新用户标识: ${uuid}`);
  } else {
    console.log(`[UUID] 加载已有用户标识: ${uuid}`);
  }

  return uuid;
}

/**
 * 清除用户 UUID (用于测试或用户主动注销)
 */
export function clearUserUUID(): void {
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  console.log("[UUID] 已清除用户标识");
}

/**
 * 检查是否为首次访问 (UUID 是否为新生成)
 */
export function isFirstVisit(): boolean {
  return getCookie(COOKIE_NAME) === null;
}
