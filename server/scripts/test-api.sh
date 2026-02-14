#!/usr/bin/env bash
# 本地 API 测试。需先 pnpm run dev；完整测试需 MongoDB 运行。
set -e
BASE="${BASE_URL:-http://127.0.0.1:3000}"

echo "=== 1. GET /health ==="
curl -s "$BASE/health" | head -1
echo ""

echo "=== 2. POST /api/v1/auth/guest ==="
GUEST=$(curl -s -X POST "$BASE/api/v1/auth/guest" -H "Content-Type: application/json" -d '{}')
echo "$GUEST"
TOKEN=$(echo "$GUEST" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo "（游客登录需 MongoDB，未拿到 token 则跳过 3、4）"
  exit 0
fi

echo ""
echo "=== 3. POST /api/v1/match/finish ==="
curl -s -X POST "$BASE/api/v1/match/finish" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"targetCode":"1234","totalTimeMs":60000,"actionTimeline":[{"timestamp":0,"guessCode":"5678","result":"0A0B"},{"timestamp":5000,"guessCode":"1234","result":"4A0B"}],"isWin":true}'
echo ""

echo ""
echo "=== 4. GET /api/v1/match/ghost ==="
curl -s "$BASE/api/v1/match/ghost" -H "Authorization: Bearer $TOKEN"
echo ""

echo ""
echo "=== 5. GET /api/v1/leaderboard ==="
curl -s "$BASE/api/v1/leaderboard?page=1&limit=5"
echo ""

echo ""
echo "--- 全部请求已发送 ---"
