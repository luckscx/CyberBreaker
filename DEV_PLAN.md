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

- **场景与入口**
  - 保留/整理 `main` 场景为游戏主场景；必要时拆出：登录、大厅、对局、结算。
  - 入口场景加载后跳转到「大厅」或直接「单机练习」。
- **1A2B 核心逻辑（纯本地）**
  - 生成/校验无重复 4 位数字暗码。
  - 输入：4 位数字输入 UI（可复用/扩展现有 `DynamicNumpad` 思路）。
  - 判定：单次猜测 → 计算 A/B，返回如 `"1A1B"`。
  - 胜利条件：一次猜测得到 `4A0B`。
- **单局流程**
  - 开局 → 生成暗码 → 循环：输入 → 判定 → 显示反馈 → 若未胜继续。
  - 简单 UI：当前猜测历史列表 + 最新反馈 + 数字键盘。
- **倒计时（单机先简化）**
  - 单回合限时（如 15 秒）或整局限时；超时视为本回合/本局失败，便于后续与幽灵对齐。

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
