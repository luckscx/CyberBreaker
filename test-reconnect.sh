#!/bin/bash
# 断线重连功能快速测试脚本

set -e

echo "==================================="
echo "  断线重连功能快速测试"
echo "==================================="
echo ""

# 检查依赖
echo "1️⃣  检查依赖..."
if ! command -v node &> /dev/null; then
    echo "❌ 未安装 Node.js"
    exit 1
fi
echo "✅ Node.js 已安装: $(node -v)"

# 编译检查
echo ""
echo "2️⃣  TypeScript 编译检查..."
cd server
if npx tsc --noEmit; then
    echo "✅ 服务端编译通过"
else
    echo "❌ 服务端编译失败"
    exit 1
fi

cd ../web
if npx tsc --noEmit; then
    echo "✅ 前端编译通过"
else
    echo "❌ 前端编译失败"
    exit 1
fi
cd ..

# 检查核心文件
echo ""
echo "3️⃣  检查核心文件..."
files=(
    "web/src/utils/uuid.ts"
    "server/src/room/store.ts"
    "server/src/room/wsHandler.ts"
    "web/src/room/client.ts"
    "web/src/scenes/RoomWaitScene.ts"
    "web/src/scenes/RoomPlayScene.ts"
    "RECONNECT_FEATURE.md"
    "RECONNECT_TEST_GUIDE.md"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ 缺失: $file"
        exit 1
    fi
done

echo ""
echo "==================================="
echo "  ✅ 所有检查通过！"
echo "==================================="
echo ""
echo "下一步："
echo "1. 启动服务端: cd server && pnpm dev"
echo "2. 启动前端: cd web && pnpm dev"
echo "3. 打开浏览器访问 http://localhost:5173"
echo "4. 参考 RECONNECT_TEST_GUIDE.md 进行测试"
echo ""
echo "快速测试步骤："
echo "  • 创建房间并开始游戏"
echo "  • 进行 2-3 次猜测"
echo "  • 刷新页面 (F5)"
echo "  • 验证是否自动重连并恢复历史记录"
echo ""
