# CyberBreaker 部署说明

## 部署信息
- **访问域名**: http://nu.grissom.cn
- **部署路径**: /data/cyberbreaker
- **服务端口**: 3030
- **MongoDB端口**: 27017 (Docker容器)

## 服务管理

### Backend Server
```bash
# 查看状态
pm2 list

# 查看日志
pm2 logs cyberbreaker-server

# 重启服务
pm2 restart cyberbreaker-server

# 停止服务
pm2 stop cyberbreaker-server
```

### MongoDB
```bash
# 查看容器状态
docker ps | grep mongo

# 查看日志
docker logs cyberbreaker-mongo

# 重启MongoDB
docker restart cyberbreaker-mongo

# 停止MongoDB
docker stop cyberbreaker-mongo

# 启动MongoDB
docker start cyberbreaker-mongo
```

### Nginx
```bash
# 测试配置
nginx -t

# 重新加载配置
nginx -s reload

# 重启nginx
systemctl restart nginx

# 查看配置
cat /etc/nginx/conf.d/cyberbreaker.conf
```

## 更新部署

### 1. 更新代码
```bash
cd /data/cyberbreaker
# 通过rsync从本地同步，或通过git pull
```

### 2. 更新Server
```bash
cd /data/cyberbreaker/server
pnpm install  # 如果package.json有变化
pnpm build
pm2 restart cyberbreaker-server
```

### 3. 更新Web
```bash
cd /data/cyberbreaker/web
pnpm install  # 如果package.json有变化
pnpm build
# 无需重启，nginx直接提供静态文件
```

## 环境配置

Server配置文件: /data/cyberbreaker/server/.env
```
PORT=3030
MONGODB_URI=mongodb://127.0.0.1:27017/cyberbreaker
JWT_SECRET=your-secret-key
DEV_SEED_ALLOW=1
```

## 目录结构
```
/data/cyberbreaker/
├── server/              # 后端服务
│   ├── dist/           # 编译后的JS文件
│   ├── src/            # TypeScript源码
│   ├── .env            # 环境配置
│   └── ecosystem.config.cjs  # PM2配置
├── web/                # 前端应用
│   ├── dist/           # 生产构建（nginx提供）
│   └── src/            # 源码
├── mongodb/            # MongoDB数据目录（Docker挂载）
└── logs/               # PM2日志目录
```

## 监控

### 查看运行状态
```bash
pm2 status
docker ps
systemctl status nginx
```

### 健康检查
```bash
# Backend健康检查
curl http://localhost:3030/health

# 通过nginx
curl http://nu.grissom.cn/health

# 测试API
curl http://nu.grissom.cn/api/v1/dev/ghost-stats
```

## 故障排查

### 502 Bad Gateway
- 检查后端是否运行: `pm2 list`
- 查看后端日志: `pm2 logs cyberbreaker-server`
- 检查端口占用: `lsof -i :3030`

### MongoDB连接失败
- 检查容器状态: `docker ps | grep mongo`
- 查看MongoDB日志: `docker logs cyberbreaker-mongo`
- 测试连接: `docker exec -it cyberbreaker-mongo mongosh`

### 静态文件404
- 检查构建目录: `ls -la /data/cyberbreaker/web/dist/`
- 检查nginx配置: `cat /etc/nginx/conf.d/cyberbreaker.conf`
- 测试nginx配置: `nginx -t`

## 自动启动

PM2已配置为开机自启:
```bash
pm2 startup  # 已配置
pm2 save     # 保存当前进程列表
```

Docker容器已设置自动重启:
```bash
docker update --restart=always cyberbreaker-mongo
```

## 🚀 一键部署脚本

项目提供了两个自动化部署脚本：

### 1. 完整部署（推荐）
```bash
./deploy.sh
```
功能：
- 同步所有代码到服务器
- 自动安装依赖（如有变化）
- 构建 Server 和 Web
- 重启后端服务
- 验证部署状态

适用场景：
- 首次部署
- 依赖包有更新（package.json变化）
- 大量代码改动

### 2. 快速部署
```bash
./deploy-quick.sh
```
功能：
- 快速同步代码
- 智能检测变化（只构建修改过的部分）
- 重启服务

适用场景：
- 日常开发迭代
- 小改动快速上线
- 不涉及依赖变更

## 部署命令快速参考

### 手动部署流程
```bash
# 1. 同步代码到服务器
rsync -avz --exclude 'node_modules' --exclude 'dist' -e "ssh -p 36000" \
  /Users/grissom/Game/CyberBreaker/ root@lh.grissom.cn:/data/cyberbreaker/

# 2. SSH登录服务器
ssh root@lh.grissom.cn -p 36000

# 3. 安装依赖并构建
cd /data/cyberbreaker/server && pnpm install && pnpm build
cd /data/cyberbreaker/web && pnpm install && pnpm build

# 4. 重启服务
pm2 restart cyberbreaker-server
```
