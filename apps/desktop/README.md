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

## Windows 安装包

手动运行 GitHub Actions Windows Desktop workflow，输入真实部署的 HTTPS
api_origin。工作流会先验证 HTTPS origin、编译测试，再生成未签名的 NSIS
预览安装包，仅供受控测试，不应作为正式发行版。
本地 release 构建前须设置编译环境变量 STEPMARK_API_ORIGIN=https://...，
运行 npx @tauri-apps/cli@2 build。Release 未配置 origin 时客户端拒绝连接。

正式发行前仍需：代码签名与 SmartScreen 信誉、Windows 真机登录/注销/
WebView2 安装测试、威胁建模、服务端 TLS 与运维验收、可靠更新机制、
隐私/数据留存审查、恢复与回滚演练。CI 编译不等于已完成这些验收。

## 安全边界

当前桌面端为在线只读版本。请勿在没有幂等键、冲突检测、撤销和同步测试前
加入离线写入；不要把 AI Key、数据库连接串或私有研究题库打包到客户端。
当前认知测验和习惯进度仍属于实验性证据，不能宣称已获心理测量学效度认证。
