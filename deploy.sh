#!/bin/bash

# CyberBreaker 一键部署脚本
# 用途：同步代码到服务器并重启服务

set -e  # 遇到错误立即退出

# 配置变量
SERVER="root@lh.grissom.cn"
PORT="36000"
REMOTE_PATH="/data/cyberbreaker"
LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}CyberBreaker 部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 1. 同步代码
echo -e "${YELLOW}[1/5] 同步代码到服务器...${NC}"
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude '.claude' \
  --exclude '.cursor' \
  --exclude '.codebuddy' \
  --exclude '.dev_pids' \
  --exclude '*.log' \
  --exclude 'server/dist' \
  --exclude 'web/dist' \
  -e "ssh -p ${PORT}" \
  "${LOCAL_PATH}/" "${SERVER}:${REMOTE_PATH}/"

echo -e "${GREEN}✓ 代码同步完成${NC}"
echo ""

# 2. 构建 Server
echo -e "${YELLOW}[2/5] 构建 Server...${NC}"
ssh -p ${PORT} ${SERVER} "cd ${REMOTE_PATH}/server && /root/.nvm/versions/node/v22.17.0/bin/pnpm install && /root/.nvm/versions/node/v22.17.0/bin/pnpm build"
echo -e "${GREEN}✓ Server 构建完成${NC}"
echo ""

# 3. 构建 Web
echo -e "${YELLOW}[3/5] 构建 Web...${NC}"
ssh -p ${PORT} ${SERVER} "cd ${REMOTE_PATH}/web && /root/.nvm/versions/node/v22.17.0/bin/pnpm install && /root/.nvm/versions/node/v22.17.0/bin/pnpm build"
echo -e "${GREEN}✓ Web 构建完成${NC}"
echo ""

# 4. 重启 Backend（进程不存在时自动改为启动）
echo -e "${YELLOW}[4/5] 重启 Backend 服务...${NC}"
ssh -p ${PORT} ${SERVER} "if /usr/local/bin/pm2 describe cyberbreaker-server >/dev/null 2>&1; then
  /usr/local/bin/pm2 restart cyberbreaker-server
else
  echo '进程不存在，首次启动...'
  cd ${REMOTE_PATH}/server && /usr/local/bin/pm2 start ecosystem.config.cjs
  /usr/local/bin/pm2 save
fi"
echo -e "${GREEN}✓ Backend 重启完成${NC}"
echo ""

# 5. 验证部署
echo -e "${YELLOW}[5/5] 验证部署...${NC}"
sleep 3  # 等待服务启动

# 检查健康状态
HEALTH_STATUS=$(ssh -p ${PORT} ${SERVER} "curl -s http://localhost:3030/health" || echo "failed")
if [[ $HEALTH_STATUS == *"ok"* ]]; then
  echo -e "${GREEN}✓ Backend 健康检查通过${NC}"
else
  echo -e "${RED}✗ Backend 健康检查失败${NC}"
  echo -e "${YELLOW}查看日志：ssh -p ${PORT} ${SERVER} 'pm2 logs cyberbreaker-server --lines 20'${NC}"
  exit 1
fi

# 检查服务状态
echo ""
echo -e "${YELLOW}服务状态：${NC}"
ssh -p ${PORT} ${SERVER} "/usr/local/bin/pm2 list | grep cyberbreaker"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 部署成功！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "访问地址: ${GREEN}http://nu.grissom.cn${NC}"
echo -e "健康检查: ${GREEN}http://nu.grissom.cn/health${NC}"
echo ""
echo -e "查看日志: ${YELLOW}ssh -p ${PORT} ${SERVER} 'pm2 logs cyberbreaker-server'${NC}"
echo -e "查看状态: ${YELLOW}ssh -p ${PORT} ${SERVER} 'pm2 status'${NC}"
echo ""
