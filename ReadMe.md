# 潜行解码 (Cyber Breaker)

基于「猜数字 1A2B」逻辑的 H5 小游戏：支持单机练习与双人房间对战。

## ✨ 核心特性

- 🎮 **单机练习模式**: 本地挑战，快速上手
- 🔗 **联机对战模式**: 创建房间，分享链接，实时 PVP
- 🔄 **断线重连**: 刷新页面自动恢复游戏进度（基于 UUID）
- 🎯 **多种规则**: 标准 1A2B / 位置赛模式
- 🎵 **音效系统**: 背景音乐 + 点击反馈

## 游戏模式

| 模式 | 说明 |
|------|------|
| **单机模式** | 本地游玩，系统随机 4 位不重复数字，玩家在本地完成猜数字，无服务端对局。 |
| **房间模式** | 创建房间后获得分享链接，另一人通过链接加入。双方各自设定暗码，通过 WebSocket 实时轮流猜对方密码，先猜中 4A 者胜。 |

### 1A2B 规则简述

- **A**：数字与位置都正确  
- **B**：数字正确但位置错误  
- 示例：密码 `4079`，猜测 `4712` → 反馈 `1A1B`

## 技术栈

- **前端 (web)**：Pixi.js + Vite + TypeScript，纯 H5
- **服务端 (server)**：Node.js + Express + TypeScript，HTTP API + WebSocket
- **房间**：内存存储（无持久化），WebSocket 路径 `/ws/room/:roomId`，支持 host/guest 角色

## 项目结构

```
CyberBreaker/
├── web/          # 前端：首页 → 单机(GuessScene) / 房间(创建→RoomWait→RoomPlay)
├── server/       # 服务端：/api/v1/room、/ws/room/:roomId
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

首页选「单机模式」无需服务端；选「创建房间」需服务端已启动。另一人通过 `?room=房间ID` 链接加入房间。

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

- [CLAUDE.md](./CLAUDE.md) - 项目架构和开发指南
- [RECONNECT_FEATURE.md](./RECONNECT_FEATURE.md) - 断线重连功能说明
- [RECONNECT_TEST_GUIDE.md](./RECONNECT_TEST_GUIDE.md) - 断线重连测试指南
- [web/src/utils/UUID_README.md](./web/src/utils/UUID_README.md) - UUID 系统文档

## 房间 API 摘要

- `POST /api/v1/room/create`：创建房间，返回 `roomId`、`joinUrl`、`wsPath`
- `GET /api/v1/room/:roomId`：查询房间状态
- WebSocket `ws://host/ws/room/:roomId?role=host|guest`：设暗码、轮流猜、判胜

（后续可扩展：幽灵对战、MMR、MongoDB/Redis 等。）
