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

# 记录线上 .env 指纹：部署结束时再取一次比对，确认同步没有覆盖线上配置。
# 这是防止「本地开发用 .env 覆盖生产密钥」这类事故的最后一道保险。
ENV_MD5_BEFORE=$(ssh -p ${PORT} ${SERVER} "md5sum ${REMOTE_PATH}/server/.env 2>/dev/null | awk '{print \$1}'" || echo "none")
echo -e "${YELLOW}线上 .env 指纹（部署前）：${ENV_MD5_BEFORE:-none}${NC}"
echo ""

# 1. 同步代码
echo -e "${YELLOW}[1/5] 同步代码到服务器...${NC}"
# 排除项说明（每条都对应一个会打挂线上服务的真实原因）：
#   .env      —— 本地 .env 往往是开发/测试配置（如指向 localhost 的库地址），
#                服务器上的 .env 才有真实的 MONGODB_URI / JWT_SECRET。
#                不排除的话一次同步就会覆盖线上配置，导致连不上库、登录全失效。
#   mongodb   —— 服务器 /data/cyberbreaker/mongodb 是 MongoDB 容器的 bind mount
#                （即真实数据目录，挂到容器 /data/db），绝不能参与同步。
#   其余      —— 依赖、构建产物、IDE 状态、日志等运行期文件。
#
# 另外：这里刻意「不用 --delete」。远端存在仓库里没有的运行期文件
# （.env、logs/、mongodb/ 等），--delete 会以本地内容为准把它们删掉，
# 风险远大于收益。
rsync -avz --progress \
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

echo -e "${GREEN}✓ 代码同步完成${NC}"
echo ""

# 2. 构建 Server
echo -e "${YELLOW}[2/5] 构建 Server...${NC}"
# CI=true 不可省：pnpm 在非交互（无 TTY）环境下，若需要重建 node_modules 会直接
# 以 ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY 中止，导致构建中断。
# 顺带在 CI 模式下 pnpm 默认按 frozen-lockfile 校验，锁文件与 package.json
# 不一致时会明确报错，而不是静默改写锁文件。
ssh -p ${PORT} ${SERVER} "cd ${REMOTE_PATH}/server && CI=true /root/.nvm/versions/node/v22.17.0/bin/pnpm install && /root/.nvm/versions/node/v22.17.0/bin/pnpm build"
echo -e "${GREEN}✓ Server 构建完成${NC}"
echo ""

# 3. 构建 Web
echo -e "${YELLOW}[3/5] 构建 Web...${NC}"
ssh -p ${PORT} ${SERVER} "cd ${REMOTE_PATH}/web && CI=true /root/.nvm/versions/node/v22.17.0/bin/pnpm install && /root/.nvm/versions/node/v22.17.0/bin/pnpm build"
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

# 校验 1：线上 .env 未被同步覆盖
echo ""
ENV_MD5_AFTER=$(ssh -p ${PORT} ${SERVER} "md5sum ${REMOTE_PATH}/server/.env 2>/dev/null | awk '{print \$1}'" || echo "none")
if [ "$ENV_MD5_BEFORE" = "$ENV_MD5_AFTER" ]; then
  echo -e "${GREEN}✓ 线上 .env 未被改动（${ENV_MD5_AFTER}）${NC}"
else
  echo -e "${RED}✗ 线上 .env 指纹发生变化！${ENV_MD5_BEFORE} → ${ENV_MD5_AFTER}${NC}"
  echo -e "${RED}  请立刻检查 ${REMOTE_PATH}/server/.env 是否被本地配置覆盖${NC}"
  exit 1
fi

# 校验 2：公网拿到的 bundle 必须与服务器构建产物字节一致 —— 这才是
# 「部署真的生效」的硬证据。别用源码里的某个字符串当特征串：验证过
# "touch-action" 在新旧 bundle 里都命中 0，是个无效标记。
BUNDLE=$(curl -s -m 15 https://nu.grissom.cn/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
if [ -n "$BUNDLE" ]; then
  LIVE_MD5=$(curl -s -m 60 "https://nu.grissom.cn/${BUNDLE}" | md5sum | awk '{print $1}')
  DIST_MD5=$(ssh -p ${PORT} ${SERVER} "md5sum ${REMOTE_PATH}/web/dist/${BUNDLE} 2>/dev/null | awk '{print \$1}'")
  echo -e "首页 bundle: ${BUNDLE}"
  echo -e "  公网 md5: ${LIVE_MD5}"
  echo -e "  dist md5: ${DIST_MD5}"
  if [ -n "$DIST_MD5" ] && [ "$LIVE_MD5" = "$DIST_MD5" ]; then
    echo -e "${GREEN}✓ 公网产物与构建产物字节一致，部署已生效${NC}"
  else
    echo -e "${RED}✗ 公网产物与构建产物不一致（检查 nginx root 与缓存）${NC}"
    exit 1
  fi
else
  echo -e "${RED}✗ 未能从首页解析出 bundle 文件名${NC}"
  exit 1
fi

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
