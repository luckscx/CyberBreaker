#!/usr/bin/env bash
# 停止 dev_start.sh 启动的后台进程

cd "$(dirname "$0")"
PID_FILE=".dev_pids"

if [ ! -f "$PID_FILE" ]; then
  echo "no .dev_pids found, nothing to stop"
  exit 0
fi

while read -r pid; do
  [ -n "$pid" ] && kill "$pid" 2>/dev/null && echo "stopped $pid"
done < "$PID_FILE"
rm -f "$PID_FILE"
echo "dev stopped"
