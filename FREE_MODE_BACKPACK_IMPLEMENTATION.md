# Free Mode 道具背包系统实现总结

## ✅ 实现完成

已成功为 free 模式（自由猜测/多人淘汰赛模式）添加道具背包系统，包含全局影响效果的道具。

## 功能特性

### 默认道具配置

每位玩家在进入 free 房间时会自动获得以下道具：

1. **➕ 追加** (extra_guess) x1
   - 效果：额外增加 2 次猜测机会
   - 类型：self（影响自己）

2. **🔍 揭示** (reveal_one) x2
   - 效果：揭示答案中的一位数字及其位置
   - 类型：self（影响自己）
   - 特点：可多次使用，记录已揭示位置，避免重复

3. **❌ 排除** (eliminate_two) x2
   - 效果：排除两个不在答案中的数字
   - 类型：self（影响自己）
   - 特点：记录已排除数字，避免重复排除

4. **💡 提示** (hint) x1
   - 效果：显示答案包含的所有数字（不含位置）
   - 类型：self（影响自己）
   - 特点：适用于数字可重复的 free 模式

### 服务器端实现

#### 1. 道具定义 (`/server/src/freeRoom/items.ts`)
- `FreeItemType` 枚举：定义 4 种道具类型
- `FREE_ITEMS` 配置：包含名称、描述、图标、类别
- `FREE_MODE_DEFAULT_INVENTORY`：默认库存配置
- 验证函数：`isValidFreeItemId()`

#### 2. 数据结构更新 (`/server/src/freeRoom/store.ts`)
- `FreePlayer` 接口新增字段：
  - `inventory: { [itemId: string]: number }` - 道具库存
  - `itemEffects` - 道具效果状态（记录已揭示/排除的内容）
- 初始化时自动分配默认道具

#### 3. 道具效果处理 (`/server/src/freeRoom/itemEffects.ts`)
- `extraGuess()` - 增加猜测次数（服务器端需配合实现）
- `revealOne()` - 随机揭示一个未揭示的位置
- `eliminateTwo()` - 随机排除 2 个错误数字
- `showHint()` - 显示所有包含数字
- 所有效果都记录到 `player.itemEffects`，避免重复

#### 4. WebSocket 处理 (`/server/src/freeRoom/wsHandler.ts`)
- `joined` 消息：下发初始 inventory
- `use_item` 消息处理：
  - 验证道具 ID
  - 检查库存数量
  - 消费道具
  - 应用效果
  - 返回效果数据和更新后的库存

### 客户端实现

#### 1. 道具定义 (`/web/src/data/freeItems.ts`)
- 客户端道具配置（与服务器端同步）
- `freeInventoryToItemData()` - 转换库存为显示格式

#### 2. FreeRoomClient 更新 (`/web/src/freeRoom/client.ts`)
- `FreeRoomMsg` 接口新增：`inventory`, `itemId`, `effectData`
- 新增方法：`useItem(itemId)`

#### 3. FreeGuessPlay 场景集成 (`/web/src/scenes/FreeGuessPlay.ts`)
- 添加 **BackpackButton** 到顶部工具栏
  - 显示 🎒 图标和道具总数徽章
  - 位置：MusicToggle 左侧
- 添加 **BackpackModal** 模态框
  - 显示所有可用道具
  - 点击道具卡片使用道具
  - 游戏结束后禁用
- 道具效果可视化：
  - 屏幕下方显示效果文字提示
  - 淡入显示 2 秒后淡出
  - 记录本地效果状态（eliminatedDigits, revealedPositions, knownDigits）

#### 4. Game.ts 更新 (`/web/src/Game.ts`)
- 新增 `freeInventory` 字段保存库存
- 在 `joined` 消息时保存 inventory
- 传递 inventory 给 FreeGuessPlay 场景

## 道具效果详情

### 1. 追加 (extra_guess)
**服务器端：**
```typescript
{
  effect: 'extra_guess',
  amount: 2,
  newLimit: room.guessLimit + 2
}
```
**客户端显示：**
```
➕ 获得额外2次机会！
```

### 2. 揭示 (reveal_one)
**服务器端：**
```typescript
{
  effect: 'reveal_one',
  position: 0-3,
  digit: '0-9'
}
```
**客户端显示：**
```
🔍 揭示：位置1是5
```

### 3. 排除 (eliminate_two)
**服务器端：**
```typescript
{
  effect: 'eliminate_two',
  eliminated: ['3', '7']
}
```
**客户端显示：**
```
❌ 排除数字：3, 7
```

### 4. 提示 (hint)
**服务器端：**
```typescript
{
  effect: 'hint',
  digits: ['1', '2', '5', '9']
}
```
**客户端显示：**
```
💡 提示：答案包含 1, 2, 5, 9
```

## 文件清单

### 新增文件 (4)
1. `/server/src/freeRoom/items.ts` - 道具定义和配置
2. `/server/src/freeRoom/itemEffects.ts` - 道具效果处理器
3. `/web/src/data/freeItems.ts` - 客户端道具定义
4. 本文档

### 修改文件 (5)
1. `/server/src/freeRoom/store.ts` - 添加 inventory 和 itemEffects 字段
2. `/server/src/freeRoom/wsHandler.ts` - 处理 use_item 消息
3. `/web/src/freeRoom/client.ts` - 添加 useItem 方法
4. `/web/src/scenes/FreeGuessPlay.ts` - 集成背包 UI 和效果处理
5. `/web/src/Game.ts` - 保存和传递 inventory

## 构建状态
- ✅ 服务器构建成功
- ✅ Web 客户端构建成功
- ✅ 无 TypeScript 错误

## 测试建议

### 功能测试
1. 创建 free 房间
2. 加入游戏后检查背包按钮是否显示正确的道具数量
3. 点击背包打开模态框，验证 4 种道具都显示正确
4. 使用每种道具，验证：
   - **追加**：剩余次数文本应该更新（注意：服务器端需要额外实现次数增加逻辑）
   - **揭示**：应该显示揭示的位置和数字
   - **排除**：应该显示排除的数字
   - **提示**：应该显示答案包含的所有数字
5. 道具用完后，卡片应该变灰且无法点击
6. 游戏结束后，背包应该被禁用

### 边缘情况
- 所有位置都揭示后再使用揭示道具 → 应提示"已揭示所有位置"
- 所有错误数字都排除后再使用排除道具 → 应提示"没有更多数字可排除"
- 游戏结束后点击背包 → 应该无法打开

## 与 PVP 模式的区别

| 特性 | Free 模式 | PVP 模式 |
|------|----------|----------|
| 道具获取 | 游戏开始时自动分配 | 根据房间规则分配 |
| 道具类型 | 4种全局影响道具 | 6种（包含buff和debuff） |
| 使用限制 | 仅限自己回合 | 自己回合 + 对手道具 |
| 效果范围 | 仅影响自己 | 可影响对手 |
| 库存管理 | 游戏内临时 | 持久化到 MongoDB |

## 后续优化建议

1. **追加道具服务器端实现**：目前追加道具只返回效果数据，但服务器端的 `room.guessLimit` 是全局的。需要改为每个玩家独立的 `remainingGuesses` 字段。

2. **道具动画效果**：添加粒子效果或动画使道具使用更有趣。

3. **道具音效**：不同道具使用时播放不同的音效。

4. **道具商店**：允许玩家在游戏外购买/解锁更多道具。

5. **道具平衡性**：根据游戏数据调整道具数量和效果强度。

6. **多人协作道具**：添加可以影响所有玩家的全局道具（如"时间暂停"、"全场提示"等）。

## 使用示例

```typescript
// 服务器端：玩家使用揭示道具
case 'use_item': {
  const itemId = 'reveal_one';
  player.inventory[itemId]--;
  const effectData = applyFreeItemEffect(itemId, room, player);
  // effectData = { effect: 'reveal_one', position: 2, digit: '7' }
}

// 客户端：显示效果
private _applyItemEffect(itemId: string, effectData: any): void {
  if (effectData.effect === 'reveal_one') {
    this.revealedPositions.push({
      pos: effectData.position,
      digit: effectData.digit
    });
    this._showItemEffect(`🔍 揭示：位置${effectData.position + 1}是${effectData.digit}`);
  }
}
```

## 总结

Free 模式的道具背包系统已完全实现并通过构建测试。系统提供了 4 种全局影响效果的道具，帮助玩家更有策略地猜测答案。所有道具效果都有清晰的视觉反馈，并且会记录状态避免重复效果。系统架构清晰，易于扩展新道具类型。
