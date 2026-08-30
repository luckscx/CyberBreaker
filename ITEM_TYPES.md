# 物品类型扩展功能

## 概述

游戏现在支持多种物品类型，不仅限于数字！你可以猜水果 🍎、数字或未来添加的任何物品类型。

## 新增功能

### 1. 可扩展的物品类型系统

在 `web/src/types/itemTypes.ts` 中定义了一个灵活的物品类型配置系统：

```typescript
export interface ItemType {
  id: string;              // 唯一标识符
  name: string;            // 显示名称
  items: string[];         // 物品列表（可以是数字、emoji 等）
  ui: {
    slotSize: number;      // 输入槽大小
    keySize: number;       // 按键大小
    fontSize: number;      // 字号
    slotFontSize: number;  // 槽内字号
    columns: number;       // 每行列数
  };
  rules: string;           // 游戏规则说明
  allowRepeat?: boolean;   // 是否允许重复
}
```

### 2. 预定义物品类型

#### 数字类型
- 10个数字：0-9
- 3列布局
- 适中字号

#### 水果类型
- 8种水果：🍎 🍊 🍋 🍌 🍉 🍇 🍓 🫐
- 4列布局
- 较大字号（优化 emoji 显示）

### 3. 物品类型选择界面

点击"教学模式"后，会显示物品类型选择界面，展示：
- 物品预览（前4个物品）
- 物品种类数量
- 选择按钮

### 4. 重构的核心逻辑

#### `guess.ts` 新增函数：

```typescript
// 支持任意物品集合生成秘密序列
generateSecretFromItems(items: string[], length = 4, allowRepeat = false): string

// 验证猜测（支持任意物品类型）
isValidGuessForItems(guess: string, validItems: string[], length = 4, allowRepeat = false): boolean

// evaluate() 函数已更新，使用 Array.from() 正确处理 emoji
```

#### `GuessInput` 组件重构：

- 接受 `itemType` 参数
- 动态生成按键布局（支持不同列数）
- 支持 emoji 等 Unicode 字符
- 自适应 UI 配置（字号、大小等）

## 如何添加新的物品类型

在 `web/src/types/itemTypes.ts` 中添加新配置：

```typescript
export const ITEM_TYPE_ANIMALS: ItemType = {
  id: "animals",
  name: "动物",
  items: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯"],
  ui: {
    slotSize: 56,
    keySize: 62,
    fontSize: 28,
    slotFontSize: 32,
    columns: 5, // 每行5个动物
  },
  rules: "🎯 4个不重复  💡 A=位置对 B=动物对位置错",
  allowRepeat: false,
};

// 添加到导出数组
export const ALL_ITEM_TYPES: ItemType[] = [
  ITEM_TYPE_DIGITS,
  ITEM_TYPE_FRUITS,
  ITEM_TYPE_ANIMALS, // 新增
];
```

## 技术细节

### Emoji 处理

使用 `Array.from()` 而不是 `split('')` 来正确处理 emoji：

```typescript
// ❌ 错误 - 会拆分某些 emoji
const items = "🍎🍊🍋🍌".split("");

// ✅ 正确 - 正确处理所有 Unicode 字符
const items = Array.from("🍎🍊🍋🍌");
```

### 向后兼容

所有现有功能保持不变：
- 关卡模式仍使用数字
- 多人对战仍使用数字
- 教学模式新增物品类型选择

## 文件变更列表

### 新增文件
- `web/src/types/itemTypes.ts` - 物品类型配置
- `web/src/scenes/ItemTypeSelectScene.ts` - 物品类型选择界面

### 修改文件
- `web/src/logic/guess.ts` - 添加泛型物品支持
- `web/src/components/GuessInput.ts` - 重构为支持任意物品类型
- `web/src/scenes/GuessScene.ts` - 接受 itemType 参数
- `web/src/Game.ts` - 添加物品类型选择流程
- `web/src/scenes/CampaignScene.ts` - 更新 API 调用（eliminatedDigits → eliminatedItems）

## 未来扩展可能性

1. **更多物品类型**：颜色、形状、国旗等
2. **混合模式**：不同物品类型组合
3. **自定义物品集**：用户自定义物品
4. **关卡模式集成**：不同关卡使用不同物品类型
5. **多人对战扩展**：支持不同物品类型的对战
