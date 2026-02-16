# Free 模式重连错误处理优化

## 问题描述

之前 free 模式在重连房间出错时，只显示错误文本，没有提供返回首页的方式，用户会卡在错误页面。

## 解决方案

### 1. 增强 FreeRoomClient

**文件：** `/web/src/freeRoom/client.ts`

**改进内容：**

- 添加 `closeListeners` 数组，用于监听连接断开事件
- 添加 `onClose(fn)` 方法，允许注册连接断开回调
- 改进 `onclose` 事件处理：
  - 记录详细的断开日志（包括 code 和 reason）
  - 通知所有 close 监听器
  - 处理连接阶段的异常断开
- 改进 `onerror` 事件处理：
  - 添加详细的错误日志
  - 仅在未 resolve 时 reject Promise
- 改进 `onmessage` 事件处理：
  - 添加错误捕获和日志记录
- 添加 `resolved` 标志，防止重复 resolve/reject

### 2. 优化 Game.ts 错误处理

**文件：** `/web/src/Game.ts`

**改进内容：**

#### 2.1 添加故意断开标志
```typescript
private freeRoomIntentionalLeave = false;
```
用于区分用户主动离开和意外断开。

#### 2.2 监听连接断开
```typescript
this.freeClient.onClose(() => {
  if (!this.freeRoomIntentionalLeave) {
    console.warn("[Game] Free room connection closed unexpectedly");
    this._showErrorAndReturnHome("连接已断开");
  }
});
```

#### 2.3 处理服务器错误消息
在 `onMessage` 中添加错误类型检测：
```typescript
if (msg.type === "error") {
  console.error("[Game] Free room error:", msg.message);
  lobbyUnsub?.();
  this.leaveFreeRoom();
  this._showErrorAndReturnHome(msg.message ?? "房间错误");
  return;
}
```

#### 2.4 新增 `_showErrorAndReturnHome` 方法
功能：
- 清空舞台
- 显示错误消息（红色加粗）
- 显示"2秒后返回首页..."提示
- 2秒后自动返回首页

#### 2.5 更新 `leaveFreeRoom` 方法
设置 `freeRoomIntentionalLeave = true`，避免触发意外断开警告。

## 错误处理场景

### 场景 1: 连接失败
**触发条件：** WebSocket 连接无法建立（网络问题、服务器不可用等）

**处理流程：**
1. `connect()` Promise 被 reject
2. 触发 `enterFreeRoom` 的 catch 回调
3. 调用 `_showErrorAndReturnHome("连接房间失败")`
4. 显示错误页面 2 秒后返回首页

### 场景 2: 服务器拒绝连接
**触发条件：**
- 房间不存在
- 房间已满
- 密码错误
- 游戏已开始/结束

**处理流程：**
1. 服务器发送 `{ type: "error", message: "具体错误原因" }`
2. WebSocket 关闭连接
3. `onMessage` 捕获错误消息
4. 调用 `leaveFreeRoom()` 清理资源
5. 调用 `_showErrorAndReturnHome(msg.message)`
6. 显示错误页面 2 秒后返回首页

### 场景 3: 游戏中意外断开
**触发条件：**
- 网络断开
- 服务器崩溃
- WebSocket 超时

**处理流程：**
1. WebSocket `onclose` 事件触发
2. `FreeRoomClient` 通知所有 close 监听器
3. `Game.ts` 的 `onClose` 回调被触发
4. 检查 `freeRoomIntentionalLeave` 标志（为 false）
5. 调用 `_showErrorAndReturnHome("连接已断开")`
6. 显示错误页面 2 秒后返回首页

### 场景 4: 用户主动离开
**触发条件：**
- 点击返回按钮
- 游戏结束后退出

**处理流程：**
1. 调用 `leaveFreeRoom()`
2. 设置 `freeRoomIntentionalLeave = true`
3. 关闭 WebSocket 连接
4. `onClose` 回调检测到故意断开标志，不显示错误
5. 清理资源并正常返回首页

## 错误页面设计

```
┌─────────────────────────────┐
│                             │
│                             │
│      连接房间失败           │ ← 红色加粗
│                             │
│   2秒后返回首页...          │ ← 灰色
│                             │
│                             │
└─────────────────────────────┘
```

## 文件修改清单

### 修改文件 (2)
1. `/web/src/freeRoom/client.ts` - 增强错误处理和连接监听
2. `/web/src/Game.ts` - 添加统一错误处理和自动返回首页

### 新增方法
- `FreeRoomClient.onClose(fn)` - 注册连接断开回调
- `Game._showErrorAndReturnHome(errorMsg)` - 显示错误并返回首页

### 修改方法
- `FreeRoomClient.connect()` - 改进错误处理逻辑
- `FreeRoomClient.close()` - 清理 closeListeners
- `Game.enterFreeRoom()` - 添加 onClose 监听和错误消息处理
- `Game.leaveFreeRoom()` - 设置故意断开标志

## 构建状态
- ✅ Web 客户端构建成功
- ✅ 无 TypeScript 错误
- ✅ 所有场景都有完善的错误处理

## 测试建议

### 测试用例 1: 连接不存在的房间
1. 输入一个不存在的房间码
2. 点击加入
3. **预期结果：** 显示"连接房间失败"，2秒后返回首页

### 测试用例 2: 连接已满的房间
1. 创建一个房间并加满 8 个玩家
2. 尝试第 9 个玩家加入
3. **预期结果：** 显示"房间已满"（或相应错误），2秒后返回首页

### 测试用例 3: 密码错误
1. 创建带密码的房间
2. 使用错误密码加入
3. **预期结果：** 显示"密码错误"，2秒后返回首页

### 测试用例 4: 游戏中断网
1. 加入房间并开始游戏
2. 断开网络连接（关闭 Wi-Fi 或拔网线）
3. **预期结果：** 显示"连接已断开"，2秒后返回首页

### 测试用例 5: 服务器重启
1. 加入房间
2. 重启服务器
3. **预期结果：** 显示"连接已断开"，2秒后返回首页

### 测试用例 6: 正常退出
1. 加入房间
2. 点击返回按钮
3. **预期结果：** 直接返回首页，无错误提示

## 改进前后对比

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 连接失败 | 显示静态错误文本，无法返回 | 显示错误，2秒后自动返回首页 |
| 服务器错误 | 无处理 | 显示具体错误消息，自动返回 |
| 意外断开 | 无处理，界面卡住 | 显示"连接已断开"，自动返回 |
| 正常退出 | 正常 | 正常（无误报错误）|

## 技术亮点

1. **智能断开检测：** 通过 `freeRoomIntentionalLeave` 标志区分主动和意外断开
2. **统一错误处理：** 所有错误都通过 `_showErrorAndReturnHome` 统一处理
3. **友好的用户体验：** 自动返回首页，无需手动操作
4. **详细的日志：** 所有错误都有对应的 console 日志，便于调试
5. **优雅的连接管理：** 支持多个 onClose 监听器，便于扩展

## 后续优化建议

1. **重连机制：** 对于意外断开，可以尝试自动重连几次再返回首页
2. **错误上报：** 将错误信息上报到服务器，用于监控和分析
3. **可配置的返回延迟：** 允许配置自动返回的延迟时间（目前固定 2 秒）
4. **添加手动返回按钮：** 在错误页面添加"立即返回"按钮，不想等待的用户可以立即返回
5. **错误重试：** 对于某些临时性错误（如网络波动），提供"重试"选项

## 总结

通过增强 FreeRoomClient 的错误处理能力和在 Game.ts 中添加统一的错误处理流程，现在 free 模式在遇到任何连接问题时都能：

1. ✅ 清晰地显示错误原因
2. ✅ 自动返回首页（2秒延迟）
3. ✅ 记录详细的错误日志
4. ✅ 区分主动和意外断开
5. ✅ 提供友好的用户体验

用户不会再因为连接错误而卡在某个页面，系统会自动恢复到正常状态。
