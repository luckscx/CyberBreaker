#!/bin/bash

# CyberBreaker 快速部署脚本（仅同步代码并重启，不重新构建）
# 适用场景：仅修改了 server/src 或 web/src 中的代码

set -e

# 配置变量
SERVER="root@lh.grissom.cn"
PORT="36000"
REMOTE_PATH="/data/cyberbreaker"
LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}快速部署模式（不重新安装依赖）${NC}"
echo ""

# 检查是否需要构建
BUILD_SERVER=false
BUILD_WEB=false

# 检查 server 源码是否有变化
if git diff --name-only HEAD~1 HEAD | grep -q "^server/src"; then
  BUILD_SERVER=true
  echo -e "${YELLOW}检测到 server 代码变化，将重新构建${NC}"
fi

# 检查 web 源码是否有变化
if git diff --name-only HEAD~1 HEAD | grep -q "^web/src"; then
  BUILD_WEB=true
  echo -e "${YELLOW}检测到 web 代码变化，将重新构建${NC}"
fi

# 1. 同步代码
echo -e "${YELLOW}[1/4] 同步代码...${NC}"
# 排除项与 deploy.sh 保持一致：.env（防止覆盖线上 MONGODB_URI / JWT_SECRET）、
# mongodb（服务器上 MongoDB 容器的真实数据 bind mount）。同样不使用 --delete。
rsync -az \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'server/dist' \
  --exclude 'web/dist' \
  --exclude '.git' \
  --exclude '.claude' \
  --exclude '.cursor' \
  --exclude '.codebuddy' \
  --exclude '.dev_pids' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  --exclude 'logs' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude 'package-lock.json' \
  --exclude 'mongodb' \
  -e "ssh -p ${PORT}" \
  "${LOCAL_PATH}/" "${SERVER}:${REMOTE_PATH}/"
echo -e "${GREEN}✓ 完成${NC}"

# 2. 构建（如果需要）
if [ "$BUILD_SERVER" = true ]; then
  echo -e "${YELLOW}[2/4] 构建 Server...${NC}"
  ssh -p ${PORT} ${SERVER} "cd ${REMOTE_PATH}/server && /root/.nvm/versions/node/v22.17.0/bin/pnpm build"
  echo -e "${GREEN}✓ 完成${NC}"
else
  echo -e "${YELLOW}[2/4] 跳过 Server 构建（无变化）${NC}"
fi

if [ "$BUILD_WEB" = true ]; then
  echo -e "${YELLOW}[3/4] 构建 Web...${NC}"
  ssh -p ${PORT} ${SERVER} "cd ${REMOTE_PATH}/web && /root/.nvm/versions/node/v22.17.0/bin/pnpm build"
  echo -e "${GREEN}✓ 完成${NC}"
else
  echo -e "${YELLOW}[3/4] 跳过 Web 构建（无变化）${NC}"
fi

# 3. 重启服务（进程不存在时自动改为启动）
echo -e "${YELLOW}[4/4] 重启服务...${NC}"
ssh -p ${PORT} ${SERVER} "if /usr/local/bin/pm2 describe cyberbreaker-server >/dev/null 2>&1; then
  /usr/local/bin/pm2 restart cyberbreaker-server
else
  echo '进程不存在，首次启动...'
  cd ${REMOTE_PATH}/server && /usr/local/bin/pm2 start ecosystem.config.cjs
  /usr/local/bin/pm2 save
fi"
echo -e "${GREEN}✓ 完成${NC}"

echo ""
echo -e "${GREEN}🚀 快速部署完成！${NC}"
echo -e "访问: http://nu.grissom.cn"
