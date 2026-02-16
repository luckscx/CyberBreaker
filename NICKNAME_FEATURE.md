# 玩家昵称功能说明

## 功能概述

玩家可以通过设置界面自定义昵称，该昵称会在多人对战模式中显示给其他玩家。

## 实现细节

### 1. 数据存储 (`web/src/services/settingsManager.ts`)

- 使用浏览器 Cookie 存储玩家昵称
- Cookie 名称: `cyberbreaker_nickname`
- 默认昵称: `玩家`
- 有效期: 1年
- 验证规则:
  - 不能为空
  - 最少2个字符
  - 最多10个字符

### 2. 设置界面 (`web/src/scenes/SettingsScene.ts`)

#### 界面功能
- 显示当前昵称
- 点击输入框进入编辑模式
- 实时键盘输入支持（包括中文字符）
- 按 Enter 保存，按 Escape 取消
- 验证错误提示
- 保存成功反馈

#### 交互设计
- 输入框激活时边框变为高亮色 (#00ffcc)
- 输入时显示光标 ("|")
- 支持退格删除
- 限制最大长度10个字符

### 3. 主界面入口 (`web/src/scenes/HomeScene.ts`)

- 在右上角添加设置按钮（⚙️图标）
- 位置：音乐按钮左侧
- 点击后进入设置界面

### 4. 多人对战集成 (`web/src/Game.ts`)

在创建或加入多人房间时，使用 Cookie 中保存的昵称：

```typescript
const nickname = getNickname(); // 从 Cookie 读取
const playerId = getUserUUID();
freeClient.connect(roomCode, nickname, playerId, password);
```

### 5. 排行榜集成 (`web/src/scenes/CampaignScene.ts`)

#### 关卡完成时自动填充昵称
- 完成关卡后弹出昵称输入对话框
- 输入框默认值为 Cookie 中保存的昵称
- 玩家可以修改昵称后提交
- 提交成功后自动更新 Cookie（如果昵称有变化）

#### 实现细节
```typescript
// 创建输入框时设置默认值
input.value = getNickname();

// 提交成功后更新Cookie（如果有变化）
if (playerName !== getNickname()) {
  setNickname(playerName);
}
```

## 使用流程

### 设置昵称
1. 在主界面点击右上角⚙️设置按钮
2. 点击"玩家昵称"输入框
3. 输入想要的昵称（2-10个字符）
4. 点击"保存昵称"按钮或按 Enter
5. 看到"✓ 保存成功"提示
6. 点击返回按钮回到主界面

### 多人对战中使用
1. 设置好昵称后，进入"🎲 多人房间"模式
2. 创建或加入房间
3. 其他玩家会看到你设置的昵称
4. 在排行榜、历史记录等位置都会显示该昵称

### 关卡排行榜中使用
1. 完成关卡后会弹出昵称输入对话框
2. 输入框会自动填充你在设置中保存的昵称
3. 可以直接提交，也可以修改后再提交
4. 提交后昵称会自动更新到 Cookie（如果有修改）
5. 下次完成关卡时会自动使用最新的昵称

## API 使用

### 获取昵称
```typescript
import { getNickname } from "@/services/settingsManager";

const nickname = getNickname(); // 返回当前昵称或默认值
```

### 设置昵称
```typescript
import { setNickname } from "@/services/settingsManager";

setNickname("我的昵称"); // 保存到 Cookie
```

### 验证昵称
```typescript
import { validateNickname } from "@/services/settingsManager";

const result = validateNickname("测试");
if (result.valid) {
  // 昵称有效
} else {
  console.error(result.error); // 显示错误信息
}
```

## 文件清单

### 新增文件
- `web/src/services/settingsManager.ts` - 昵称管理服务
- `web/src/scenes/SettingsScene.ts` - 设置界面场景

### 修改文件
- `web/src/types.ts` - 添加 "settings" 游戏模式
- `web/src/scenes/HomeScene.ts` - 添加设置按钮
- `web/src/Game.ts` - 添加设置场景路由，使用昵称连接房间
- `web/src/scenes/CampaignScene.ts` - 排行榜上报时使用Cookie昵称作为默认值

## 技术特性

- ✅ 持久化存储（Cookie）
- ✅ 输入验证
- ✅ 实时键盘输入
- ✅ 中英文支持
- ✅ 友好的用户反馈
- ✅ 移动端适配
- ✅ 动画背景
- ✅ 与现有系统集成
- ✅ 排行榜自动填充昵称
- ✅ 智能更新（提交后自动保存修改）

## 后续优化建议

1. 添加更多个性化设置（头像、主题色等）
2. 支持昵称历史记录
3. 添加昵称唯一性检查（需要服务器支持）
4. 支持表情符号
5. 添加昵称敏感词过滤
