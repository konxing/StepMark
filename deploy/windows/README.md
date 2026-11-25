# Windows 本机部署

同一台 Windows 电脑运行网页后台和个人客户端。服务器管理器启动本站后，在浏览器打开 [本机网页](http://127.0.0.1:8080)。DeepSeek 回复沿原 HTTPS 请求返回到本机客户端或网页后台。

## 第一次准备

1. 在 StepMark 仓库根目录安装 Node.js 24.14 或更新版本、项目依赖和本机 PostgreSQL。为 StepMark 准备独立的数据库，已有 StepMark 数据库可继续使用。
2. 把数据库连接填写在 `apps/web/.env.local` 的 `DATABASE_URL`。可以沿用现有 `RATE_LIMIT_SECRET`。新库可运行下面的命令生成一个并放进同一文件。网页 AI 使用该文件的 `DEEPSEEK_API_KEY`。

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

3. 在仓库根目录完成数据库迁移、题库初始化和生产构建。先备份已有数据库。下列命令显式读取 `.env.local`。

   ```powershell
   npm.cmd ci
   npm.cmd run db:generate
   Push-Location apps/web
   node --env-file=.env.local ../../node_modules/prisma/build/index.js migrate deploy
   node --env-file=.env.local ../../node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json prisma/seed.ts
   Pop-Location
   npm.cmd run build --workspace @stepmark/web -- --webpack
   ```

4. 直接使用数据库中已验证的账户。首次部署并且还没有账户时，可从服务器本机建立账号。密码通过隐蔽输入提示读入。

   ```powershell
   .\deploy\windows\create-local-account.ps1 -Email owner@local.test
   ```

## 日常使用

- 在 [Windows Desktop 构建](https://github.com/konxing/StepMark/actions/workflows/desktop-windows.yml) 下载 `StepMark-Windows-Server-Manager` 中的 `StepMark-Server-Manager.exe`。打开后选 StepMark 仓库根目录，再点「启动」和「打开本机网页」。需要重启时可在同一窗口操作。目录会保存在当前 Windows 用户的应用数据目录中。
- 「网站进程」反映管理器启动的进程，「本机回源」检查 `127.0.0.1:8080/api/health`，「检查公网」可以单独探测公网域名。切换既有部署时，先用原管理工具停止占用 8080 的服务。
- 「测试 DeepSeek」使用网页后台配置向官方接口发送一条最小请求，检查实际回复；本机数据库或网站尚未启动时也能测试。日志区区分密钥、余额、DNS、代理、网络权限和超时故障。命令行可运行 `npm.cmd run check:ai --workspace @stepmark/web`。
- 从同一运行下载 `StepMark-Windows-Local-unsigned-preview`。个人客户端的「连接设置 → 测试连接」检查本机到 DeepSeek。网页 AI 的 API Key 与桌面端凭据分别配置。
- 如果需要从本机开发环境跑真实模型对照，可在仓库目录执行 `npm.cmd run evaluate:measurement --workspace @stepmark/web -- --live`。脚本只发送仓库里的 20 条合成样例，输出匹配、误收和漏收数量。

本机模式监听 `127.0.0.1:8080`，只接收该地址的直接请求。公网部署使用现有的 HTTPS 入口和对应配置，参见 [公网部署](../README.md)。

## DeepSeek 网络配置

网页后台在 Windows 上自动读取当前用户已启用的系统代理，并在 Node.js 24.14+ 中启用请求代理。已有 `HTTPS_PROXY`（或 `https_proxy`）优先，本机地址始终绕过代理。更改代理设置后重启网站服务。此功能只读取系统设置，不修改 Windows 配置；使用 PAC 自动代理脚本时，请在 `apps/web/.env.local` 显式填写 `HTTPS_PROXY`。

```dotenv
# 示例端口需与自己的代理一致
HTTPS_PROXY=http://127.0.0.1:7897
# 如需关闭 Windows 系统代理的自动读取
# STEPMARK_USE_SYSTEM_PROXY=0
```

使用代理的旧版 Node.js 会提示升级版本。直接连接的环境仍兼容 Node.js 22+。上述连接测试只验证实际连通性和 JSON 回复，量化效果由独立的真实模型对照测试评估。
