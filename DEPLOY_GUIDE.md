# 部署脚本使用说明

本项目提供了两个自动化部署脚本，可以一键将代码部署到生产服务器。

## 脚本说明

### 1. `deploy.sh` - 完整部署（推荐）

**功能：**
- ✅ 同步所有代码文件到服务器
- ✅ 自动安装/更新依赖包
- ✅ 构建 Server (TypeScript → JavaScript)
- ✅ 构建 Web (打包静态资源)
- ✅ 重启后端服务
- ✅ 自动验证部署状态

**使用方法：**
```bash
./deploy.sh
```

**适用场景：**
- 首次部署
- package.json 依赖有更新
- 大量代码改动
- 需要完整构建验证

**预计耗时：** 2-3 分钟

---

### 2. `deploy-quick.sh` - 快速部署

**功能：**
- ✅ 快速同步代码
- ✅ 智能检测变化（只构建修改的部分）
- ✅ 重启服务

**使用方法：**
```bash
./deploy-quick.sh
```

**适用场景：**
- 日常开发迭代
- 小改动快速上线
- 不涉及依赖变更
- 仅修改业务逻辑代码

**预计耗时：** 30秒-1分钟

---

## 部署前检查清单

- [ ] 代码已经在本地测试通过
- [ ] 已提交到 git（可选，但推荐）
- [ ] 确认要部署到生产环境
- [ ] 确保服务器 SSH 连接正常

## 部署后验证

脚本执行完成后，可以通过以下方式验证：

### 1. 访问网站
- 打开浏览器访问: http://nu.grissom.cn
- 检查功能是否正常

### 2. 查看服务状态
```bash
ssh root@lh.grissom.cn -p 36000 "pm2 status"
```

### 3. 查看实时日志
```bash
ssh root@lh.grissom.cn -p 36000 "pm2 logs cyberbreaker-server"
```

### 4. 健康检查
```bash
curl http://nu.grissom.cn/health
```

## 常见问题

### Q: 部署失败怎么办？

**A:** 脚本会自动检测并提示错误。常见问题：

1. **SSH 连接失败**
   - 检查网络连接
   - 确认 SSH 端口 36000 可访问

2. **构建失败**
   - 查看错误信息
   - 检查代码是否有语法错误
   - 手动登录服务器查看详细日志

3. **服务启动失败**
   - 查看 PM2 日志: `ssh root@lh.grissom.cn -p 36000 "pm2 logs cyberbreaker-server --lines 50"`
   - 检查端口是否被占用
   - 检查环境变量配置

### Q: 如何回滚到上一个版本？

**A:** 如果使用 git 管理代码：
```bash
# 1. 本地回退到上一个版本
git checkout <上一个commit>

# 2. 重新部署
./deploy.sh
```

### Q: 能否只部署 Server 或只部署 Web？

**A:** 可以手动执行部分步骤：

**只部署 Server：**
```bash
# 同步 server 代码
rsync -avz -e "ssh -p 36000" ./server/src/ root@lh.grissom.cn:/data/cyberbreaker/server/src/

# SSH 登录构建并重启
ssh root@lh.grissom.cn -p 36000
cd /data/cyberbreaker/server && pnpm build
pm2 restart cyberbreaker-server
```

**只部署 Web：**
```bash
# 同步 web 代码
rsync -avz -e "ssh -p 36000" ./web/src/ root@lh.grissom.cn:/data/cyberbreaker/web/src/

# SSH 登录构建
ssh root@lh.grissom.cn -p 36000
cd /data/cyberbreaker/web && pnpm build
# Web 是静态文件，无需重启
```

## 脚本配置

如果服务器信息有变化，可以编辑脚本中的配置变量：

```bash
SERVER="root@lh.grissom.cn"     # SSH 用户名和地址
PORT="36000"                     # SSH 端口
REMOTE_PATH="/data/cyberbreaker" # 服务器部署路径
```

## 技术支持

如遇问题，请查看：
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 完整部署文档
- [CLAUDE.md](./CLAUDE.md) - 项目开发文档
- 或联系开发团队
