# 赛博密码 (Cyber Breaker)

基于经典「1A2B」逻辑的 H5 竞技解谜游戏，支持单人练习、关卡挑战、多人实时对战。

## ✨ 核心特性

- 🎓 **教学模式**: 无限练习，快速上手1A2B规则
- 🎯 **关卡模式**: 20个精心设计的挑战关卡，配备道具和星级评价
- 🏆 **排行榜系统**: 每关独立排行，记录最佳成绩
- 🎲 **多人房间**: 2-8人同时游玩，自由猜数抢先破解
- ⚔️ **联机对战**: 1v1实时PVP，回合制对战
- 🎒 **道具系统**: 揭示位置、排除数字、提示内容等策略道具
- 🔗 **断线重连**: 刷新页面自动恢复游戏进度
- 🎵 **音效系统**: 背景音乐 + 点击反馈
- 👤 **个性化设置**: 自定义昵称，统一显示

## 游戏模式

| 模式 | 说明 |
|------|------|
| **🎓 教学模式** | 无时间/次数限制，随机生成4位不重复数字，适合新手练习掌握1A2B规则。 |
| **🎯 关卡模式** | 20个精心设计的关卡，逐步提升难度。包含时间限制、猜测次数限制、道具辅助、星级评价等要素。完成后可上传成绩至排行榜。 |
| **🏆 排行榜** | 查看每个关卡的全球最佳成绩，按猜测次数和用时排序。 |
| **⚔️ 联机对战** | 创建1v1房间，分享链接邀请对手。双方各自设定密码，通过WebSocket实时轮流猜测，先达到4A者获胜。 |
| **🎲 多人房间** | 创建2-8人房间，所有玩家同时猜测同一个答案，可使用道具辅助，抢先破解者获胜。支持实时排名和历史记录。 |

### 1A2B 规则简述

- **A**：数字与位置都正确  
- **B**：数字正确但位置错误  
- 示例：密码 `4079`，猜测 `4712` → 反馈 `1A1B`

## 技术栈

- **前端 (web)**：Pixi.js 8 + Vite + TypeScript，H5游戏，移动端优化
- **服务端 (server)**：Node.js + Express + TypeScript，HTTP API + WebSocket
- **数据库**：MongoDB (Mongoose) - 存储排行榜、用户数据
- **房间管理**：内存存储（无持久化），WebSocket 实时通信
- **音频**：Web Audio API 合成音效，背景音乐

## 项目结构

```
CyberBreaker/
├── web/          # 前端：Pixi.js H5游戏
│   ├── src/
│   │   ├── scenes/      # 游戏场景（首页、关卡、对战等）
│   │   ├── components/  # 可复用组件（按钮、输入框等）
│   │   ├── data/        # 关卡配置、道具数据
│   │   ├── logic/       # 游戏逻辑（1A2B计算、道具效果）
│   │   ├── api/         # HTTP API客户端
│   │   ├── room/        # 房间客户端（1v1对战）
│   │   ├── freeRoom/    # 多人房间客户端
│   │   ├── services/    # 本地服务（进度、设置）
│   │   └── audio/       # 音频系统
│   └── ...
├── server/       # 服务端：Node.js + Express
│   ├── src/
│   │   ├── routes/      # API路由
│   │   ├── room/        # 房间管理（1v1对战）
│   │   ├── freeRoom/    # 多人房间管理
│   │   ├── models/      # MongoDB数据模型
│   │   └── services/    # 业务逻辑
│   └── ...
└── docs/         # 项目文档
```

## 本地运行

**服务端**

```bash
cd server && pnpm install && pnpm run dev
```

默认 `http://localhost:3000`，需先启动再玩房间模式。

**前端**

```bash
cd web && pnpm install && pnpm run dev
```

打开浏览器访问提示的地址（通常是 `http://localhost:5173`）。教学模式无需服务端，其他模式需先启动服务端。

## 🚀 生产部署

项目已部署到生产环境：**https://nu.grissom.cn**

### 一键部署脚本

```bash
# 完整部署（安装依赖 + 构建 + 重启）
./deploy.sh

# 快速部署（仅同步代码 + 重启）
./deploy-quick.sh
```

详细说明请查看 [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)

## 📚 文档

- [CLAUDE.md](./CLAUDE.md) - 项目架构和开发指南（Claude Code专用）
- [NICKNAME_FEATURE.md](./NICKNAME_FEATURE.md) - 玩家昵称功能说明
- [BACKPACK_IMPLEMENTATION.md](./BACKPACK_IMPLEMENTATION.md) - 背包系统实现文档
- [RECONNECT_FEATURE.md](./RECONNECT_FEATURE.md) - 断线重连功能说明
- [RECONNECT_TEST_GUIDE.md](./RECONNECT_TEST_GUIDE.md) - 断线重连测试指南
- [web/src/utils/UUID_README.md](./web/src/utils/UUID_README.md) - UUID 系统文档
- [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) - 生产部署指南

## API 摘要

### 房间相关
- `POST /api/v1/room/create`：创建1v1房间，返回 `roomId`、`joinUrl`、`wsPath`
- `GET /api/v1/room/:roomId`：查询房间状态
- WebSocket `/ws/room/:roomId?role=host|guest&uuid=xxx`：设密码、轮流猜、判胜负

### 多人房间相关
- `POST /api/v1/free-room/create`：创建多人房间，返回房间码
- `GET /api/v1/free-room/:roomCode`：查询房间信息
- WebSocket `/ws/free-room/:roomCode?nickname=xxx&playerId=xxx`：加入房间、提交猜测、使用道具

### 排行榜相关
- `GET /api/v1/leaderboard/campaign?levelId=1&page=1&limit=20`：获取关卡排行榜
- `POST /api/v1/leaderboard/campaign`：提交关卡成绩

（后续可扩展：用户系统、社交功能、更多游戏模式等。）
