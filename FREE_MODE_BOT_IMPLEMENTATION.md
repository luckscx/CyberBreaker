# Free 模式单人 Bot 支持实现

## 功能概述

为 free 模式添加了 Bot 支持，允许房主一个人也可以开始游戏。当只有一个玩家时，系统会自动添加一个 AI Bot 陪同游戏。

## Bot 特性

### 基本信息
- **昵称：** 🤖 AI助手
- **ID 格式：** `bot_` + 随机字符串
- **猜测频率：** 每 5 秒随机猜测一次
- **猜测方式：** 完全随机生成 4 位数字（数字可重复）

### 行为规则
1. ✅ Bot 会参与排名竞争
2. ✅ Bot 受猜测次数限制
3. ✅ Bot 可能赢得游戏
4. ✅ Bot 猜测次数用完会被淘汰
5. ✅ Bot 猜中 4A0B 会立即结束游戏

## 实现细节

### 服务器端修改

#### 1. 启动游戏逻辑修改 (`wsHandler.ts`)

**修改前：**
```typescript
if (!canStart(room)) {
  send(ws, { type: 'error', message: '至少需要2名玩家' });
  return;
}
```

**修改后：**
```typescript
if (room.players.length < 1) {
  send(ws, { type: 'error', message: '房间为空' });
  return;
}

// Add bot if only one player
if (room.players.length === 1) {
  addBotPlayer(room);
  console.log('[FreeRoom] added bot player to room=%s', roomCode);
}

// ...
// Start bot behavior if bot exists
startBotBehavior(room, roomCode);
```

#### 2. 新增 Bot 相关函数 (`store.ts`)

**`addBotPlayer(room)`**
- 创建 Bot 玩家对象
- 使用假的 WebSocket（不实际使用）
- 分配默认道具库存
- 初始化道具效果状态

```typescript
export function addBotPlayer(room: FreeRoom): FreePlayer {
  const fakeWs = {
    readyState: 1, // OPEN
    send: () => {},
    close: () => {},
  } as any;

  const botPlayer: FreePlayer = {
    ws: fakeWs,
    playerId: 'bot_' + Math.random().toString(36).slice(2, 8),
    nickname: '🤖 AI助手',
    submitCount: 0,
    bestScore: 0,
    eliminated: false,
    history: [],
    inventory: { ...FREE_MODE_DEFAULT_INVENTORY },
    itemEffects: {},
  };

  room.players.push(botPlayer);
  return botPlayer;
}
```

**`getBotPlayer(room)`**
- 查找房间中的 Bot 玩家
- 通过 `playerId` 前缀 `bot_` 识别

#### 3. Bot 行为系统 (`wsHandler.ts`)

**`startBotBehavior(room, roomCode)`**
- 使用 `setInterval` 每 5 秒执行一次
- 检查游戏状态、Bot 是否淘汰
- 生成随机猜测并提交
- 更新 Bot 的统计数据
- 广播进度更新
- 检查胜利条件
- 自动清理定时器

**关键逻辑：**
```typescript
const botInterval = setInterval(() => {
  // 1. 验证房间和游戏状态
  if (!currentRoom || currentRoom.state !== 'playing') {
    clearInterval(botInterval);
    return;
  }

  // 2. 检查 Bot 状态
  const currentBot = getBotPlayer(currentRoom);
  if (!currentBot || currentBot.eliminated) {
    clearInterval(botInterval);
    return;
  }

  // 3. 生成随机猜测
  const guess = generateRandomGuess();

  // 4. 评估结果
  const { a, b } = evaluateFree(currentRoom.secret!, guess);
  currentBot.submitCount++;
  currentBot.history.push({ guess, a, b });

  // 5. 更新分数
  const score = a + b;
  if (score > currentBot.bestScore) currentBot.bestScore = score;

  // 6. 广播进度
  broadcastProgress(currentRoom);

  // 7. 检查胜利/淘汰条件
  if (a === 4) {
    finishGame(currentRoom, currentBot.playerId, 'cracked');
    clearInterval(botInterval);
  }
}, 5000);
```

**`generateRandomGuess()`**
- 生成 4 位随机数字
- 数字可重复（符合 free 模式规则）

```typescript
function generateRandomGuess(): string {
  let guess = '';
  for (let i = 0; i < 4; i++) {
    guess += Math.floor(Math.random() * 10);
  }
  return guess;
}
```

#### 4. 重启游戏逻辑更新

**修改点：**
```typescript
case 'restart': {
  // Remove bot from previous game if exists
  const oldBot = getBotPlayer(room);
  if (oldBot) {
    removePlayer(room, oldBot.playerId);
  }

  // Add new bot if only one human player
  const humanPlayers = room.players.filter(p => !p.playerId.startsWith('bot_'));
  if (humanPlayers.length === 1) {
    addBotPlayer(room);
  }

  startGame(room);
  // ...
  startBotBehavior(room, roomCode);
}
```

## 游戏流程

### 单人游戏流程
```
1. 房主创建房间
   ↓
2. 房主点击"开始游戏"（只有1个玩家）
   ↓
3. 服务器自动添加 Bot 玩家
   ↓
4. 广播 game_start（包含 Bot 在玩家列表中）
   ↓
5. 启动 Bot 定时器（5秒间隔）
   ↓
6. Bot 每5秒猜测一次
   ├─ 广播 progress 更新
   ├─ 玩家可以看到 Bot 的猜测记录
   └─ 玩家和 Bot 竞争排名
   ↓
7. 游戏结束条件：
   - Bot 猜中 4A0B → Bot 获胜
   - 玩家猜中 4A0B → 玩家获胜
   - 双方次数用完 → 比较最佳分数
```

### Bot 状态转换
```
[创建] → [猜测中] → [淘汰/获胜]
           ↓
        每5秒随机猜测
           ↓
      更新统计 + 广播
           ↓
     检查胜利/淘汰条件
```

## 客户端显示

### 玩家列表
Bot 会正常显示在玩家列表中：
```
📊 实时排名
#1 👤 玩家123  2次  3分
#2 🤖 AI助手   3次  2分
```

### 历史记录
Bot 的猜测记录会在公共排名中显示，但不会出现在玩家的个人历史记录中。

### 结算页面
Bot 可以获胜或失败，正常参与排名。

## 技术要点

### 1. 假 WebSocket 处理
Bot 不需要真实的 WebSocket 连接，使用假对象：
```typescript
const fakeWs = {
  readyState: 1,
  send: () => {},
  close: () => {},
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as any;
```

### 2. 定时器清理
Bot 定时器会在以下情况自动清理：
- 游戏结束（获胜/失败）
- Bot 被淘汰
- 房间被删除
- 游戏状态不是 'playing'

### 3. Bot 识别
通过 `playerId.startsWith('bot_')` 识别 Bot 玩家，便于：
- 重启时移除旧 Bot
- 统计人类玩家数量
- 特殊处理 Bot 行为

## 文件修改清单

### 修改文件 (2)
1. `/server/src/freeRoom/store.ts`
   - 新增 `addBotPlayer()`
   - 新增 `getBotPlayer()`

2. `/server/src/freeRoom/wsHandler.ts`
   - 修改 `start` case - 允许单人开始，自动添加 Bot
   - 修改 `restart` case - 重启时处理 Bot
   - 新增 `startBotBehavior()` - Bot 行为循环
   - 新增 `generateRandomGuess()` - 随机猜测生成

### 新增函数 (4)
- `addBotPlayer(room)` - 添加 Bot 玩家
- `getBotPlayer(room)` - 获取 Bot 玩家
- `startBotBehavior(room, roomCode)` - 启动 Bot 行为
- `generateRandomGuess()` - 生成随机猜测

## 构建状态
- ✅ 服务器构建成功
- ✅ 无 TypeScript 错误
- ✅ Bot 逻辑独立，不影响现有多人游戏

## 测试场景

### 场景 1: 单人开始游戏
1. 创建房间
2. 不邀请其他玩家
3. 点击"开始游戏"
4. **预期结果：**
   - 游戏正常开始
   - 玩家列表显示 2 个玩家（自己 + 🤖 AI助手）
   - 每 5 秒看到 Bot 的猜测记录更新

### 场景 2: Bot 获胜
1. 单人开始游戏
2. 等待 Bot 猜测
3. **预期结果：**
   - Bot 猜中后游戏结束
   - 结算页面显示 Bot 获胜
   - Bot 在排名第一

### 场景 3: 玩家获胜
1. 单人开始游戏
2. 快速猜中答案
3. **预期结果：**
   - 游戏立即结束
   - 玩家获胜
   - Bot 的定时器被清理

### 场景 4: 双方都用完次数
1. 单人开始游戏，设置较少的猜测次数（如 3 次）
2. 等待双方都用完
3. **预期结果：**
   - 游戏结束
   - 根据最佳分数判定胜负
   - 可能平局

### 场景 5: 多人加入
1. 创建房间
2. 2 个或更多玩家加入
3. 开始游戏
4. **预期结果：**
   - 不会添加 Bot
   - 正常多人游戏

### 场景 6: 重启游戏
1. 单人游戏结束
2. 点击"再来一局"
3. **预期结果：**
   - 移除旧 Bot
   - 添加新 Bot
   - 新游戏开始，Bot 继续每 5 秒猜测

## 平衡性考虑

### Bot 难度设定
- ✅ **完全随机猜测** - 难度较低，给玩家足够优势
- ✅ **5 秒间隔** - 玩家有足够时间思考
- ✅ **受次数限制** - 不会无限猜测

### 未来优化方向
1. **Bot 难度级别：**
   - 简单：完全随机（当前实现）
   - 中等：避免重复猜测已猜过的数字
   - 困难：使用基本策略（如优先猜中间数字）

2. **Bot 个性化：**
   - 不同的 Bot 名称（AI助手1、AI助手2）
   - 不同的猜测速度（3-7 秒随机）
   - 不同的策略风格

3. **多 Bot 支持：**
   - 允许添加多个 Bot 填充房间
   - Bot 之间也有竞争

## 注意事项

1. **内存清理：** Bot 的定时器必须在各种退出场景下正确清理
2. **并发安全：** 使用 `getFreeRoom()` 重新获取房间状态，避免使用过期引用
3. **Bot 识别：** 客户端可以通过 `playerId.startsWith('bot_')` 识别 Bot，显示特殊图标
4. **道具系统：** Bot 也有道具库存，但当前不会使用（可以作为未来增强）

## 总结

✅ 成功实现了 Free 模式的单人 Bot 支持功能：

1. **房主可以单人开始游戏**
2. **自动添加 AI Bot 陪同**
3. **Bot 每 5 秒随机猜测一次**
4. **Bot 参与排名和胜负判定**
5. **重启游戏时正确处理 Bot**
6. **不影响多人游戏体验**

玩家现在可以随时体验 free 模式，无需等待其他玩家加入！
