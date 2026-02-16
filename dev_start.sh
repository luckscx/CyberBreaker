#!/usr/bin/env bash
# 后台启动 server 和 web，PID 写入 .dev_pids

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT/.dev_pids"

# 若已有进程在跑，先停掉
if [ -f "$PID_FILE" ]; then
  while read -r pid; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

cd "$ROOT/server" && nohup pnpm run dev > "$ROOT/.dev_server.log" 2>&1 &
echo $! >> "$PID_FILE"

cd "$ROOT/web" && nohup pnpm run dev > "$ROOT/.dev_web.log" 2>&1 &
echo $! >> "$PID_FILE"

echo "dev started (server + web in background). logs: .dev_server.log .dev_web.log"

echo "server: http://localhost:3000"
echo "web: http://localhost:5173"