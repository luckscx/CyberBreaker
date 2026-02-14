# 客户端页面结构与 Cocos Creator Scene 映射

基于 [DEV_PLAN.md](./DEV_PLAN.md) 重新设计客户端大页面，并映射到 Scene。

---

## 一、大页面划分

| 页面 | 阶段 | 职责 | 主要内容 |
|------|------|------|----------|
| **启动/登录** | P1 | 冷启动、游客登录、跳转大厅 | 可选闪屏、无 token 时调 `/auth/guest`，保存 token 后进大厅 |
| **大厅** | P0 | 模式选择、入口汇总 | 单机练习、幽灵对局(P2)、排行榜(P4)、设置(可选) |
| **对局** | P0/P2/P3 | 单机或幽灵 1A2B 玩法 | 倒计时、历史、输入槽、键盘；幽灵模式含对手区/时间轴；P3 含能量条与技能 |
| **结算** | P4 | 本局结果与后续操作 | 胜/负、统计、MMR 变化、再战、排行榜 |
| **排行榜** | P4 | 列表展示 | 调用 `/leaderboard`，列表 + 返回大厅 |

对局页在单机/幽灵间**复用同一套 UI 骨架**，用 `mode: 'solo' | 'ghost'` 区分逻辑（是否拉幽灵、是否双轨重播、是否用技能）。

---

## 二、与 Scene 的两种映射方式

### 方式 A：单场景 + 根视图切换（推荐 P0～P2）

- **仅保留一个 Scene**：`main.scene`。
- **场景内容**：Canvas + GameRoot（挂载入口脚本）。
- **运行时**：入口脚本在 `onLoad` 中根据「当前页面」创建并显示对应根节点，其余不创建或销毁：
  - `LobbyRoot`：大厅根节点（程序化生成单机/幽灵/排行榜按钮等）
  - `GameRoot`：对局根节点（即 DEV_PLAN 中的 TopArea / HistoryArea / InputArea / KeyboardArea 等）
  - `ResultRoot`：结算根节点（或先做成弹窗挂在对局上，不单独根节点）
  - `LeaderboardRoot`：排行榜根节点
- **切换**：不调用 `director.loadScene`，只销毁当前根节点、创建并显示目标根节点；可选 `ViewManager` 或由 `GameController` 持有各 Root 的创建方法并切换。
- **优点**：与 DEV_PLAN 2.1「全部 UI 程序化、场景内不手摆」一致，无场景跳转与资源依赖，实现简单。
- **缺点**：单场景承载所有页面，后期若需按场景分资源可再拆。

### 方式 B：多场景，一页一 Scene（适合 P4 或需要清晰拆分时）

| Scene 文件 | 对应页面 | 根节点约定 | 进入方式 |
|------------|----------|------------|----------|
| `main.scene` 或 `Launcher.scene` | 启动/登录 | Canvas + LauncherRoot | 项目默认入口 |
| `Lobby.scene` | 大厅 | Canvas + LobbyRoot | Launcher 登录后 `loadScene('Lobby')` |
| `Game.scene` | 对局 | Canvas + GameRoot | 大厅点「单机/幽灵」→ `loadScene('Game', { mode })` 或全局传参 |
| `Result.scene` | 结算 | Canvas + ResultRoot | 对局结束 `loadScene('Result', { resultData })` 或 Prefab 弹窗不单独场景 |
| `Leaderboard.scene` | 排行榜 | Canvas + LeaderboardRoot | 大厅/结算 `loadScene('Leaderboard')` |

- **Game.scene**：单机与幽灵共用，通过 `director.getScene().globals` 或自定义全局/持久节点传入 `mode` 与幽灵数据（若为幽灵对局）。
- **Result**：若用弹窗形式，可不必单独 Scene，在 Game 上程序化生成结算弹窗即可，仍算作「结算页」逻辑。

---

## 三、推荐落地方案

- **P0～P2**：采用**方式 A**，仅维护 `main.scene`，入口脚本内：
  - 默认显示大厅根节点（LobbyRoot）；
  - 「单机练习」/「幽灵对局」→ 销毁 LobbyRoot，创建 GameRoot 并传入 mode，开始对局；
  - 对局结束 → 销毁 GameRoot，创建 ResultRoot（或弹窗），再战则再建 GameRoot，返回大厅则建 LobbyRoot；
  - P4 排行榜 → 在大厅或结算中「排行榜」时，销毁当前 Root，创建 LeaderboardRoot，返回则恢复 LobbyRoot。
- **P4 或需要按场景分包/分工时**：再拆为**方式 B**，新增 `Lobby.scene`、`Game.scene`、`Result.scene`（可选）、`Leaderboard.scene`，并保留 `main` 为 Launcher 或删除由 Lobby 作为首场景。

---

## 四、Scene 与根节点一览（方式 A）

| 逻辑页面 | 当前实现方式 | 根节点名 | 挂载/驱动 |
|----------|--------------|----------|-----------|
| 启动/登录 | 合并在 main 入口脚本 | （无独立根节点，或 LauncherRoot） | GameBootstrap 内先请求 guest，再建 LobbyRoot |
| 大厅 | main 内程序化 | LobbyRoot | GameBootstrap 或 LobbyController |
| 对局 | main 内程序化 | GameRoot | GameController（DEV_PLAN 2.1.4） |
| 结算 | main 内程序化弹窗或根节点 | ResultRoot / ResultPopup | GameController 或 ResultController |
| 排行榜 | main 内程序化 | LeaderboardRoot | LeaderboardController |

---

## 五、与 DEV_PLAN 的对应关系

- **2.1.1 场景与入口**：main 场景仅保留 Canvas + GameRoot 节点与入口脚本；入口脚本可先建 LobbyRoot，再提供「进入单机练习」等按钮，点击后销毁大厅、创建对局节点（即上表 GameRoot），与本文「方式 A」一致。
- **2.1.2 UI 树**：对局时的 TopArea / HistoryArea / InputArea / KeyboardArea 归属 GameRoot 下，由 GameController 在「进入对局」时创建。
- **P2 幽灵对局**：仍用同一 GameRoot，GameController 根据 mode 拉取幽灵、驱动双轨与时间轴重播。
- **P4 结算与排行榜**：结算页（ResultRoot 或弹窗）、排行榜页（LeaderboardRoot）在方式 A 下均为同一 main 场景内程序化创建的根节点切换，不新增 scene 文件。

以上完成「大页面划分」与「映射到 Cocos Creator Scene」的重新设计；实现时优先方式 A，后续再按需拆成多场景。
