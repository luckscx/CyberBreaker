import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // 目前所有测试都是纯计算（布局几何 / 1A2B 逻辑），
    // 不需要 DOM 或 WebGL，因此跑在 node 环境，速度最快。
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: ["default"],
  },
});
