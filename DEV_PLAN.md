# 潜行解码 (Cyber Breaker) 开发计划

基于 ReadMe 需求，client 为已有 Cocos Creator 2D 空场景。

---

## 一、阶段总览

| 阶段 | 名称 | 产出 |
|------|------|------|
| P0 | 基建与单机核心 | 客户端 1A2B 玩法可玩、服务端骨架、本地/单机闭环 |
| P1 | 账号与对局数据 | 登录/游客、MongoDB 持久化、对局记录写入 |
| P2 | 幽灵匹配与回放 | MMR、幽灵拉取、时间轴重播、伪实时 PVP |
| P3 | 技能系统 | 能量、三种技能、技能与幽灵交互 |
| P4 | 打磨与发布 | 结算、排行榜、H5/小游戏发布 |

---

## 二、P0：基建与单机核心

### 2.1 Client (Cocos 2D + TS)

**约定：所有 UI 均通过脚本程序化生成，不依赖在场景编辑器中手摆的 UI 节点。** 场景内仅保留必要的 Canvas 与一个挂载「入口脚本」的节点，由该脚本在 `onLoad` 中创建整棵 UI 树并挂载逻辑。

---

#### 2.1.1 场景与入口（程序化前提）

- **main 场景内容**
  - 仅保留：Canvas（含 Canvas 组件、Widget 铺满）、一个子节点如 `GameRoot`，挂载入口脚本（如 `GameBootstrap` 或 `GameController`）。
  - 不预先创建任何按钮、Label、键盘等 UI；全部由代码在运行时创建。
- **入口脚本职责**
  - `onLoad()`：创建本局所需全部 UI 根节点（见下），挂载/引用各功能组件，调用「开始一局」。
  - 可选：入口里只做「大厅」根节点，再提供「进入单机练习」按钮（同样程序化生成），点击后销毁大厅节点、创建对局节点并开始对局。

---

#### 2.1.2 UI 树结构（脚本创建的节点层级）

以下节点均在入口脚本（或由其调用的工厂方法）中 `new Node()` 并 `addChild` 生成，不列在场景里。

```
Canvas
└── GameRoot (Node, 挂载布局/锚点逻辑)
    ├── TopArea          // 顶部区域
    │   ├── TimerLabel    // 倒计时 Label
    │   └── HintLabel     // 可选：回合/状态提示
    ├── HistoryArea      // 猜测历史
    │   └── HistoryContent (Node，子节点为多条 HistoryItem)
    │       ├── HistoryItem_0 (Label 或 Node+多 Label)
    │       ├── HistoryItem_1
    │       └── ...
    ├── InputArea        // 当前输入与反馈
    │   ├── SlotContainer (Node，4 个子节点表示 4 个数字槽)
    │   │   ├── Slot_0 (Label 或 Node+Label)
    │   │   ├── Slot_1
    │   │   ├── Slot_2
    │   │   └── Slot_3
    │   └── FeedbackLabel // 最近一次 1A2B 反馈
    └── KeyboardArea     // 数字键盘
        └── KeyboardContainer (参考现有 DynamicNumpad 的 buildKeyboard)
            └── Key_1, Key_2, ... Key_0, Key_Del, Key_OK
```

- **布局方式**：各 Area 用 `UITransform.setContentSize` + `setPosition` 或配合 `Widget` 组件做简单上下/左右排布，数值可在脚本内写死常量，便于后续调参。
- **Label 与 Button**：所有文字均为 `Node + Label`，所有可点击键为 `Node + Button`（及可选 Label 子节点），样式如 `fontSize`、`color` 在脚本中设置。

---

#### 2.1.3 程序化生成步骤（按实现顺序）

**Step 1：根节点与区域骨架**

- 在入口脚本中创建 `GameRoot`，再依次创建 `TopArea`、`HistoryArea`、`InputArea`、`KeyboardArea`，并设置各自 `UITransform` 的 contentSize 与 position，使四块在屏幕上大致分区（上、中上、中下、下）。
- 可抽成独立方法如 `createTopArea(parent)`、`createHistoryArea(parent)` 等，返回根 Node，便于维护。

**Step 2：倒计时 Label（TopArea）**

- 在 `TopArea` 下 `new Node('TimerLabel')`，`addComponent(Label)`，如显示 `"15"` 或 `"0:15"`。
- 在游戏逻辑中每帧或定时（如 `schedule` 每秒）更新 `timerLabel.string`；单回合 15 秒则每秒减 1，到 0 触发超时逻辑（本回合失败/结束）。

**Step 3：数字键盘与当前输入联动（KeyboardArea + InputArea）**

- **键盘**：复用或移植现有 `DynamicNumpad` 的 `buildKeyboard()` 思路，在 `KeyboardArea` 下用循环创建 `Key_1`～`Key_0`、`Key_Del`、`Key_OK`（Node + Button + Label），点击时不再 `console.log`，而是调用「输入服务」或直接调用 GameController 的方法。
- **输入槽**：在 `InputArea` 下创建 `SlotContainer`，其下 4 个节点 `Slot_0`～`Slot_3`，每个挂 Label，初始为 `""` 或 `"_"`。数字键按下时在「当前输入缓冲区」追加一位（最多 4 位），并刷新 4 个 Slot 的 Label；Del 退格；OK 提交。
- **提交时**：读缓冲区得到 4 位字符串，交给 1A2B 判定逻辑；根据返回值更新 FeedbackLabel 并写入历史（见下）。

**Step 4：1A2B 核心逻辑（纯本地，与 UI 解耦）**

- 可在单独脚本或 GameController 内实现：
  - **生成暗码**：`generateSecret(): string`，无重复 4 位数字（如从 "0123456789" 随机取 4 个）。
  - **判定**：`evaluate(secret: string, guess: string): string`，返回 `"xAyB"`（如 `"1A1B"`）；若 `guess.length !== 4` 或含重复数字可返回 `""` 或约定错误码。
  - **胜利条件**：`evaluate` 返回 `"4A0B"` 即本局胜利。
- 不依赖任何场景节点，仅输入/输出字符串，便于单测与后续幽灵对局复用。

**Step 5：反馈与猜测历史（InputArea + HistoryArea）**

- **FeedbackLabel**：提交后把 `evaluate` 的返回值写入 `FeedbackLabel.string`（如 `"1A1B"`）。
- **历史列表**：每次提交后，在 `HistoryContent` 下 `new Node`，添加 Label（或多个 Label）组成一行，如 `"4712 → 1A1B"`，并设置该行的 position（如按 index 递减 y 偏移），实现「最新在顶部」的列表效果。若需滚动，可后续给 `HistoryContent` 外包一层 ScrollView（同样用脚本创建 Node + ScrollView 组件）。

**Step 6：单局流程与胜负**

- **开局**：入口脚本或「开始对局」时调用 `generateSecret()` 存于内存，清空 HistoryContent 子节点、清空输入槽与 FeedbackLabel，重置倒计时（如 15），开始计时。
- **循环**：用户输入 4 位 → OK → `evaluate` → 更新 Feedback 与历史；若为 `4A0B` 则弹出胜利（可程序化生成一个弹窗 Node+Label+Button），并结束本局；若超时则失败，同样可弹窗提示。
- **再玩一局**：弹窗上「再试」按钮由脚本创建，点击后再次执行开局逻辑（重新生成暗码、清空 UI、重置计时）。

---

#### 2.1.4 脚本与职责划分建议

| 脚本/模块 | 职责 |
|-----------|------|
| **GameBootstrap / GameController** | 挂于 GameRoot；onLoad 里创建整棵 UI 树，持有各 Area 及 Label/Button 的引用；驱动「开始一局」「提交」「超时」「胜利/失败」流程。 |
| **OneA2BLogic**（或同文件内方法） | 仅负责 `generateSecret()`、`evaluate(secret, guess)`，无 Cocos 依赖。 |
| **KeyboardBuilder**（或沿用 DynamicNumpad） | 接收回调 `onDigit(digit)`、`onDelete()`、`onConfirm()`，在指定 parent 下程序化生成键盘节点并绑定事件。 |
| **HistoryListHelper** | 接收「追加一条记录」接口，在传入的 HistoryContent 节点下创建并排列 HistoryItem 节点。 |

键盘与历史可先内联在 GameController 中，待稳定后再拆出。

---

#### 2.1.5 资源与样式（保持程序化）

- **字体/贴图**：若使用 TTF 或 Sprite 贴图，通过 `resources.load` / AssetManager 在运行时加载，在创建 Label 或 Sprite 时赋值；若暂无资源，Label 使用引擎默认字体，Button 使用默认过渡即可。
- **纯色块**：可用 `Graphics` 组件绘制矩形作为背景，或使用引擎自带白色 sprite 配合 `SpriteFrame` 设置 color。不依赖场景里拖拽的图片节点。
- **尺寸与位置**：所有数值（如 keyWidth、keyHeight、fontSize、各 Area 的 y 偏移）均在脚本中常量或配置对象中定义，便于统一调整。

---

#### 2.1.6 验收标准（P0 Client）

- 进入 main 场景后，所有可见 UI（倒计时、历史列表、4 位输入槽、反馈、数字键盘）均由代码生成，场景中无手摆的对应节点。
- 可完整玩一局：输入 4 位 → 提交 → 显示 1A2B 与历史；直到猜出 4A0B 或超时；胜利/失败有明确提示；可再开一局。
- 倒计时从 15 秒递减，到 0 触发超时逻辑。

### 2.2 Server (Node.js + TS)

- **项目初始化**
  - 新建 `server/`，Node + TypeScript，推荐 pnpm/uv 管理依赖。
  - 健康检查接口：`GET /health`。
- **与 Client 约定**
  - 统一 API 前缀（如 `/api/v1`）、请求/响应 JSON 结构、错误码规范（如 `code + message`）。

### 2.3 验收

- 在 Cocos 内完整玩通一局 1A2B（无网络），能赢能输，有基本倒计时。

---

## 三、P1：账号与对局数据

### 3.1 账号与鉴权

- **Server**
  - 游客：`POST /api/v1/auth/guest` → 返回 `playerId` + 简单 token（可 JWT 或随机 token 存 Redis/内存）。
  - 可选：设备 ID 绑定，防重复刷游客。
- **Client**
  - 启动时若无本地 token 则调游客登录；保存 token，后续请求带 Header（如 `Authorization: Bearer <token>`）。

### 3.2 数据模型与存储（MongoDB）

- **玩家**
  - `playerId`、`mmr`、`createdAt`、可选 `deviceId`。
- **幽灵对局记录（与 ReadMe 一致）**
  - `GhostMatchRecord`：`recordId`、`playerId`、`targetCode`、`totalTimeMs`、`mmrSnapshot`、`actionTimeline[]`（`timestamp`、`guessCode`、`result`、`usedSkill?`）。
- **对局结束**
  - 本局结束时写入一条 `GhostMatchRecord`（先不实现 MMR 更新，只落库）。

### 3.3 对局上报 API

- **Server**
  - `POST /api/v1/match/finish`：body 含 `targetCode`、`totalTimeMs`、`actionTimeline` 等；校验 token，写入 MongoDB。
- **Client**
  - 单机局结束后构造 `actionTimeline`（每步时间戳、猜测、反馈），调用 `match/finish`。

### 3.4 验收

- 游客登录成功，对局结束后能在 DB 中查到一条完整 `GhostMatchRecord`。

---

## 四、P2：幽灵匹配与回放

### 4.1 MMR 与匹配

- **Server**
  - 玩家表维护 `mmr`（可先固定初值，如 1000）。
  - `GET /api/v1/match/ghost`：参数 `playerId` 或由 token 解析；按 `mmr` 区间查询一条历史 `GhostMatchRecord`（如 ±100 分），返回整条记录（含 `actionTimeline`）。
- **Client**
  - 进入「幽灵对局」前请求 `match/ghost`，拿到一条幽灵记录。

### 4.2 双轨对局逻辑

- **规则**
  - 己方：真实输入，每步限时（如 15s），超时扣血或判负（规则与 ReadMe 一致即可）。
  - 幽灵：不真实输入，由 `actionTimeline` 按 `timestamp` 在时间轴上重播。
- **Client 重播实现**
  - 开局记录 `startTime = Date.now()`。
  - 用 `schedule`/定时器，按 `actionTimeline[].timestamp` 在对应「距离开局的毫秒数」处执行：在对手区显示该步 `guessCode` 与 `result`，可选简单动画/停顿感。
- **胜负**
  - 己方先达到 4A0B → 己方胜；若幽灵时间轴先出现 4A0B（按记录）→ 己方负；超时判负。

### 4.3 验收

- 能选「幽灵对局」，看到对手按历史时间轴一步步出招，己方同步猜自己的暗码，先 4A0B 者胜。

---

## 五、P3：技能系统

### 5.1 能量与技能槽

- **规则**
  - 每次得到 A 或 B 反馈时增加能量（数值可配置）；满额可释放一个技能。
  - 三种技能（与 ReadMe 一致）：
    - **绝对透视**：暴露幽灵方一个确切数字及位置（从幽灵的 `targetCode` 取一位，由服务端或客户端约定规则）。
    - **时间冻结**：己方倒计时暂停 10 秒。
    - **系统干扰**：幽灵下一次判定延迟 5 秒生效（重播时间轴 +5s 偏移）。

### 5.2 数据结构扩展

- **actionTimeline** 中已有 `usedSkill?`；己方释放技能时在本地时间轴插入一条「技能使用」事件，结算时一并上报。
- **Server**：`GhostMatchRecord` 已支持 `usedSkill`；若技能会暴露幽灵数字，需在拉取幽灵时决定是否返回部分 `targetCode`（如只返回一个位置），避免前端拿到完整密码。

### 5.3 Client 实现要点

- 能量条 UI、技能按钮、冷却/禁用状态。
- 时间冻结：暂停己方 `countdown`，10 秒后恢复。
- 系统干扰：对当前幽灵重播的「下一次动作」的触发时间 +5s。
- 绝对透视：向服务端请求「本局幽灵一个位置」或由服务端在 `match/ghost` 时按技能使用情况返回一个字母/位置。

### 5.4 验收

- 三种技能均可释放，效果符合说明；对局结束上报的 `actionTimeline` 含 `usedSkill`。

---

## 六、P4：打磨与发布

### 6.1 结算与排行榜

- **Server**
  - `POST /api/v1/match/finish` 已存在；补充：根据胜负更新 MMR（简易 ELO 或自研公式）。
  - 排行榜：`GET /api/v1/leaderboard`（按 MMR 或胜场），分页。
- **Client**
  - 结算页：胜/负、本局统计、MMR 变化；入口到排行榜列表。

### 6.2 可选增强

- **Redis**：游客 token、匹配池缓存、限流。
- **WebSocket**：若做观战或强实时，再上 WS；当前以 HTTP 为主即可。

### 6.3 发布

- Cocos：构建 Web H5；再配置微信/抖音小游戏等目标平台。
- Server：部署到云函数或常驻 Node 进程，配置 CORS、环境变量（MongoDB/Redis URL）。

---

## 七、目录与分工建议

```
CyberBreaker/
├── client/          # Cocos Creator 2D 项目（已有）
│   └── assets/      # 场景、脚本、预制体
├── server/          # Node.js + TS（待建）
│   ├── src/
│   │   ├── routes/  # 路由：auth, match, leaderboard
│   │   ├── models/  # GhostMatchRecord 等
│   │   └── services/
│   └── package.json
└── ReadMe.md
```

- **Client 主责**：1A2B 玩法、输入与反馈 UI、倒计时、幽灵时间轴重播、技能表现与本地效果。
- **Server 主责**：鉴权、幽灵记录读写、MMR、排行榜、技能相关数据（如暴露一位数字的接口）。

---

## 八、里程碑与优先级

| 顺序 | 里程碑 | 依赖 |
|------|--------|------|
| 1 | 单机 1A2B + 倒计时可玩 | 无 |
| 2 | 服务端健康检查 + 对局上报 | 1 |
| 3 | 游客登录 + 对局落库 | 2 |
| 4 | 幽灵拉取 + 时间轴重播 | 3 |
| 5 | 技能三件套 | 4 |
| 6 | MMR 与排行榜 | 4 |
| 7 | H5/小游戏构建与上线 | 5, 6 |

按上述顺序推进即可在保证核心体验的前提下，逐步打通「单机 → 数据 → 幽灵 PVP → 技能 → 运营功能」。
