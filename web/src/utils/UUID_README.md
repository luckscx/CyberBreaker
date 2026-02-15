# UUID 用户标识系统

## 功能说明

基于浏览器 Cookie 为每个用户自动生成唯一的 UUID (Universally Unique Identifier)，用于匿名用户识别、游戏存档、个性化设置等场景。

## 特性

- ✨ **自动生成**: 首次访问时自动创建 UUID，无需用户操作
- 🔒 **静默执行**: 后台静默存储，不影响用户体验
- 💾 **持久化**: 存储在 Cookie 中，365 天有效期
- 🔄 **跨会话**: 关闭浏览器再打开，UUID 保持不变
- 🛡️ **安全性**: SameSite=Lax 策略，防止 CSRF 攻击
- 📜 **符合标准**: 遵循 RFC 4122 UUID v4 规范

## 使用方法

### 1. 基础使用

```typescript
import { getUserUUID } from '@/utils/uuid';

// 获取当前用户 UUID (首次调用时自动生成)
const userId = getUserUUID();
console.log(userId); // 例如: "a3e4f8b2-7c1d-4f5a-9b3e-2d8f7c1a5e6b"
```

### 2. 检查是否首次访问

```typescript
import { isFirstVisit } from '@/utils/uuid';

if (isFirstVisit()) {
  console.log('欢迎新用户!');
  // 可以在这里显示新手引导
}
```

### 3. 清除 UUID (用于测试或注销)

```typescript
import { clearUserUUID } from '@/utils/uuid';

// 清除当前 UUID，下次访问会生成新的
clearUserUUID();
```

## 技术实现

### UUID 生成算法

使用符合 RFC 4122 标准的 UUID v4 生成算法：

```typescript
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

### Cookie 配置

| 属性       | 值                     | 说明                |
|----------|----------------------|-------------------|
| Name     | `cyber_breaker_uuid` | Cookie 名称         |
| MaxAge   | 365 天                | 有效期               |
| Path     | `/`                  | 全站可访问             |
| SameSite | `Lax`                | 防止 CSRF 攻击       |

### 存储机制

```
首次访问:
用户打开页面 → 检查 Cookie → 无记录 → 生成 UUID → 存储到 Cookie

后续访问:
用户打开页面 → 检查 Cookie → 有记录 → 直接读取 UUID
```

## 在项目中的集成

UUID 系统已经在 `Game.ts` 的 `start()` 方法中自动初始化：

```typescript
// web/src/Game.ts
start(): void {
  // 自动生成或加载用户 UUID (静默执行)
  getUserUUID();

  startBgm();
  // ... 其他初始化逻辑
}
```

这意味着每次游戏启动时，都会确保用户拥有一个有效的 UUID。

## 测试

### 测试页面

打开 `web/uuid-test.html` 查看交互式测试界面：

```bash
cd web
pnpm dev
# 访问 http://localhost:5173/uuid-test.html
```

测试页面提供以下功能：
- 显示当前 UUID 和访问状态
- 刷新显示 (验证 UUID 持久性)
- 清除 UUID (模拟新用户)
- 新标签页测试 (验证跨标签页一致性)

### 手动测试

1. **首次访问测试**:
   ```bash
   # 打开开发者工具 Console
   # 清除所有 Cookie
   document.cookie = "cyber_breaker_uuid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"
   # 刷新页面，查看 Console 是否输出 "[UUID] 生成新用户标识"
   ```

2. **持久化测试**:
   ```bash
   # 刷新页面多次
   # 查看 Console 是否输出 "[UUID] 加载已有用户标识"
   # 关闭浏览器再打开，UUID 应该保持不变
   ```

3. **跨标签页测试**:
   ```bash
   # 在多个标签页打开同一个游戏
   # 在 Console 中输入 getUserUUID()
   # 所有标签页应该返回相同的 UUID
   ```

## 应用场景

### 1. 游戏存档 (本地)

```typescript
interface GameSave {
  userId: string;
  level: number;
  score: number;
  timestamp: number;
}

function saveGame(level: number, score: number) {
  const save: GameSave = {
    userId: getUserUUID(),
    level,
    score,
    timestamp: Date.now(),
  };
  localStorage.setItem('game_save', JSON.stringify(save));
}
```

### 2. 匿名统计

```typescript
async function trackGameEvent(eventName: string, data: any) {
  await fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: getUserUUID(),
      event: eventName,
      data,
      timestamp: Date.now(),
    }),
  });
}
```

### 3. 个性化设置

```typescript
interface UserPreferences {
  userId: string;
  musicEnabled: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
}

function savePreferences(prefs: Omit<UserPreferences, 'userId'>) {
  const fullPrefs: UserPreferences = {
    userId: getUserUUID(),
    ...prefs,
  };
  localStorage.setItem('user_prefs', JSON.stringify(fullPrefs));
}
```

### 4. 排行榜 (匿名)

```typescript
async function submitScore(score: number, time: number) {
  await fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: getUserUUID(),
      score,
      time,
      displayName: `Player-${getUserUUID().slice(0, 8)}`, // 显示前 8 位作为昵称
    }),
  });
}
```

## 安全与隐私

### 安全特性

1. **客户端生成**: UUID 在客户端生成，服务端无法预测
2. **SameSite 保护**: Cookie 设置为 `SameSite=Lax`，防止跨站请求伪造
3. **无敏感信息**: UUID 不包含任何个人身份信息
4. **可清除**: 用户可以通过清除 Cookie 来重置身份

### 隐私合规

- ✅ 符合 GDPR 要求 (可删除、匿名化)
- ✅ 符合 CCPA 要求 (不出售个人信息)
- ✅ 不收集 PII (Personally Identifiable Information)
- ✅ 透明使用 (用户可在开发者工具中查看)

### 建议

如果需要在网站上展示隐私政策，可以添加：

> 我们使用 Cookie 存储一个匿名的用户标识符 (UUID)，用于游戏存档和个性化设置。
> 此标识符不包含任何个人信息，您可以随时通过清除浏览器 Cookie 来删除它。

## 与服务端集成 (可选)

### 发送 UUID 到服务端

```typescript
// 在 API 请求中携带 UUID
async function createRoom(rule: RoomRule): Promise<CreateRoomRes> {
  const res = await fetch(`${API_BASE}/api/v1/room/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': getUserUUID(), // 在请求头中发送 UUID
    },
    body: JSON.stringify({ rule }),
  });
  // ...
}
```

### 服务端验证 (可选)

```typescript
// server/src/middleware/userIdentity.ts
import type { Request, Response, NextFunction } from 'express';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateUserUUID(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'] as string;

  if (!userId || !UUID_REGEX.test(userId)) {
    return res.status(400).json({ error: 'Invalid or missing User ID' });
  }

  // 将 UUID 附加到请求对象
  (req as any).userId = userId;
  next();
}
```

## 故障排查

### UUID 不保存

1. 检查浏览器是否启用了 Cookie
2. 检查是否有浏览器插件屏蔽 Cookie
3. 检查浏览器隐私模式 (隐身模式下 Cookie 会在关闭后清除)

### UUID 丢失

可能的原因：
- 用户手动清除了浏览器数据
- Cookie 过期 (365 天后)
- 跨域问题 (不同域名会有不同的 UUID)

### 开发环境测试

在开发环境中，如果需要频繁测试新用户场景：

```typescript
// 在 Console 中执行
import { clearUserUUID } from '@/utils/uuid';
clearUserUUID();
location.reload();
```

## 性能

- **生成耗时**: < 1ms (纯计算，无网络请求)
- **存储大小**: ~50 字节 (36 字符 UUID + Cookie 元数据)
- **性能影响**: 忽略不计

## 未来扩展

### 可能的增强功能

1. **跨设备同步**: 通过账号系统关联多个设备的 UUID
2. **UUID 版本管理**: 支持升级到 UUID v7 (基于时间戳)
3. **加密传输**: 在 HTTPS 环境下添加 `Secure` 标志
4. **服务端验证**: 防止恶意用户伪造 UUID

### 与账号系统集成

```typescript
interface UserAccount {
  accountId: string;        // 真实账号 ID (登录后)
  anonymousUUID: string;    // 匿名 UUID (未登录)
  linkedAt?: number;        // 关联时间戳
}

// 登录后关联 UUID 到账号
async function linkUUIDToAccount(accountId: string) {
  await fetch('/api/user/link-uuid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId,
      anonymousUUID: getUserUUID(),
    }),
  });
}
```

## 参考资料

- [RFC 4122: UUID Standard](https://tools.ietf.org/html/rfc4122)
- [MDN: HTTP Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [GDPR Compliance Guide](https://gdpr.eu/)
- [SameSite Cookie Explained](https://web.dev/samesite-cookies-explained/)
