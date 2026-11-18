# StepMark Windows Desktop — Tauri 2 read-only preview

Windows 是当前优先的原生客户端。此目录提供本地静态 UI + Rust 原生网络/凭据层，
不是加载远程 Next.js 网页的 WebView。网页和原生微信小程序继续正常运行，
不新增 Android/iOS 独立 App；未来移动 App 仍复用版本化 HTTPS /api/v1 和 packages/contracts/core。

## 当前实现

- Tauri 2 / Windows WebView2；本地 HTML/CSS/JS 无远程脚本、无 Node.js 权限。
- 点击「连接账号」在系统默认浏览器打开 StepMark 网页登录和明确授权页面。
- PKCE S256 + 随机 state + 127.0.0.1 临时端口回调 + 120 秒一次性授权码；
  服务端事务消费授权码。桌面 bearer 与网页 HttpOnly cookie、微信 bearer 分离。
- 访问令牌仅由 Rust 处理，保存到 Windows Credential Manager，不返回给 JS、
  不写入 localStorage、日志或应用数据目录。桌面令牌只允许读取 /api/v1/me 和
  /api/v1/habits；所有写入、导出、测评及 AI API 被服务端拒绝。
- 显示未归档习惯的只读列表。当前无离线缓存、离线队列、自动更新或跨设备冲突合并。
- 现有 PostgreSQL/Prisma 表和历史用户数据完全不变。

**账号限制：** 当前桌面端通过邮箱网页账号授权；微信 OpenID 与邮箱账号尚未自动绑定。
即使使用同一人手机和电脑，两个不同身份的习惯也不会自动合并，避免越权访问。

## 本地开发（Windows）

1. 安装 Rust stable、Visual Studio C++ Build Tools、WebView2 Runtime。
2. 启动现有 Next.js + PostgreSQL 后端，配置 apps/web/.env；开发默认
   API 为 http://localhost:3000，仅限 debug 构建。
3. 在 apps/desktop 目录运行 npx @tauri-apps/cli@2 dev。
4. 先在系统浏览器注册、验证并登录邮箱账号，再从桌面端点击「连接账号」。
   若尚未登录，浏览器会先进入 /login，成功后返回授权确认页。
5. cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml 执行 Rust 安全边界测试。

## Windows 安装包（已绑定 stepmark.xin）

用户已确认购买 **stepmark.xin**。桌面客户端的正式 API origin 固定为
**https://stepmark.xin**（不含 www，不另设 api 子域），与网站共享
/api/v1。域名购买本身不等于 DNS、TLS、后端和数据库已部署。

- 每次推送 Windows 桌面相关代码到 main，GitHub Actions 的
  [Windows Desktop](../../.github/workflows/desktop-windows.yml) 工作流都会
  编译 Rust/Tauri 生产协议、执行本地 UI 安全检查、构建 **未签名 NSIS
  Windows 预览安装包**，并上传 14 天有效的 Actions artifact。
- 下载：GitHub 仓库 → Actions → Windows Desktop → 最新成功的 main 运行 →
  Artifacts → StepMark-Windows-stepmark.xin-unsigned-preview。
  仅供可信测试者；未签名安装包会遇到 Windows SmartScreen 警告。
- 同一工作流运行 node apps/desktop/scripts/check-deployment.mjs：
  验证域名 DNS、HTTPS 证书和未登录的 /api/v1/me、/api/v1/habits
  都返回预期 401 JSON。**此探测暂为非阻断**，允许网站部署前先验证
  安装包构建；失败表示联网登录尚不可用，不能据此宣布上线。
- 现有 Next.js 生产环境设置 APP_ORIGIN=https://stepmark.xin，
  配置公开 HTTPS 反向代理、PostgreSQL、强随机服务端密钥，
  按现有运维手册执行迁移。不要将 .env、数据库或 AI Key 放入桌面包。
- 本地 release 构建可在 apps/desktop 下设置
  STEPMARK_API_ORIGIN=https://stepmark.xin 并运行
  npx @tauri-apps/cli@2 build；开发 debug 构建仍可使用 localhost:3000。

正式发行前仍需：DNS/TLS 与生产数据库实际部署、Windows 真机登录/注销、
WebView2 安装验证、代码签名与 SmartScreen 信誉、隐私/数据留存审查、
恢复与回滚演练。GitHub CI 编译通过不等于已完成这些验收。

## 安全边界

当前桌面端为在线只读版本。请勿在没有幂等键、冲突检测、撤销和同步测试前
加入离线写入；不要把 AI Key、数据库连接串或私有研究题库打包到客户端。
当前认知测验和习惯进度仍属于实验性证据，不能宣称已获心理测量学效度认证。
