# StepMark Windows Desktop

StepMark 帮人逐步获得自主参与创造和劳动的能力：独立发现和理解问题，学习所需知识，使用工具，创造有用的东西，与人协作，并根据实际证据自主选择方向。

桌面工作台从用户手头的问题出发，交付可以直接使用的诊断、草稿、示例或验证方法。用户可以复制成果，带着真实结果回来追问。新入口应能帮助用户作出判断或推进手头的事。

## 当前实现

- Tauri 2 / Windows WebView2；本地 HTML/CSS/JS 无远程脚本、无 Node.js 权限。
- 工作台由桌面 Rust 层直接请求 `https://api.deepseek.com/chat/completions`，固定 `deepseek-flash`。
  在「连接设置」可验证、保存、测试或移除 DeepSeek Key。通过最小 Flash 请求验证后才保存进 Windows 凭据管理器。
  已配置的进程环境变量 `DEEPSEEK_API_KEY` 也可直接使用。本机保存的密钥优先。
  发送时只包含这次工作台问题和窗口内最近六轮对话。对话留在当前窗口内，成果可复制；StepMark 账号与工作台相互独立。
- 点击「连接账号」在系统默认浏览器打开 StepMark 网页登录和明确授权页面。
- PKCE S256 + 随机 state + 127.0.0.1 临时端口回调 + 120 秒一次性授权码；
  服务端事务消费授权码。桌面 bearer 与网页 HttpOnly cookie、微信 bearer 分离。
- 访问令牌仅由 Rust 处理，保存到 Windows Credential Manager，不返回给 JS、
  不写入 localStorage、日志或应用数据目录。桌面令牌只允许读取 /api/v1/me 和
  /api/v1/habits；写入、导出、测评和网站 AI API 不开放给桌面令牌。
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
  安装包 artifact 同时包含 SHA256SUMS.txt，可在 Windows PowerShell 通过
  Get-FileHash -Algorithm SHA256 校验下载文件；仅供可信测试者。
  未签名安装包可能被 Windows SmartScreen 拦截，不应要求普通用户绕过警告。
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

当前 StepMark 账号数据为在线只读。桌面工作台的 DeepSeek 请求不使用 StepMark 账号令牌。
安装包只包含模型配置和本地界面，实际密钥在运行时从 Windows 凭据管理器或进程环境读取。
当前认知测验和习惯进度仍属于实验性证据，不能宣称已获心理测量学效度认证。
