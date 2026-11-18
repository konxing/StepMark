# ADR-002 — 客户端优先的软件架构（阶段 1：后端边界与 AI 网关）

状态：**Windows-first 已确认，Tauri 2 桌面只读预览已提交，尚未完成真机/安装验收**。本文件记录渐进实施边界。
当前 main 的 Next.js 同时承载网页和 /api/v1，原生微信小程序通过同一 API
访问 PostgreSQL；packages/core 是无数据库的确定性计算，packages/contracts
提供 Zod 输入契约。**不能直接删除 apps/web**，否则小程序也会失去服务。

## 目标边界

    原生微信小程序 ───────┐
    Windows 桌面（Tauri 2）├── HTTPS /api/v1 ── 身份/授权 ── 应用用例 ── PostgreSQL
    未来原生手机 App（暂缓）─┤                          │             │
    响应式网站（继续维护）────┘                          │             └── packages/core
                                                  服务端 AI Gateway ── 允许的模型 API
                                                  （建议不能绕过应用用例权限）

客户端不能直接连数据库、持有 AI 平台密钥或决定正式分数。
**AI 只做有同意的语言解析、暂定日记编码和建议**；实际变更由
assistant-command.ts 的拒绝式授权与 assistant-execute.ts 的用户范围事务完成。
能力估计、IRT/EAP 区间、E0 证据等级、练习效应及可靠变化门槛由
packages/core 的可复验算法决定。公开演示题不允许被 AI 解释为已校准量表。

## 本次落地

- 新增 apps/web/src/server/ai-gateway.ts：OpenAI/OpenRouter/管理员指定
  OpenAI-compatible JSON Completion 接口的共同适配层；统一服务端模型配置、
  响应字节上限、超时、禁止 HTTP 跳转和上游输出校验。
- assistant-provider.ts 与 habit-ai.ts 复用网关，仍由服务端权限检查、
  AI 显式同意、审计、幂等和确定性逻辑约束；不修改历史数据。
- 自定义提供商只读取可信服务端环境变量，须明确声明 HTTPS endpoint 与
  **完全匹配的公开域名**。不接受来自用户请求的 URL、私网地址、非 443 端口、
  URL 凭据或重定向。部署层仍必须限制出站网络、DNS 解析及供应商数据留存。
- 微信小程序网络请求已从首页视图抽离至 apps/wechat-miniapp/lib/api.js，
  统一校验 API 地址、会话 bearer、超时与失败响应，并增加无需真机的契约回归测试。
- 不实现用户自带 API Key (BYOK)：在有独立加密存储、密钥撤销、授权和账单
  隔离前，不应把 API Key 存在浏览器 localStorage/小程序缓存或普通数据库字段。

## 渐进式拆分，而非一次重写

1. **服务端边界（当前）**：Next.js 继续运行 API 和旧 Web；将 AI provider
   从业务执行器隔离；保留 /api/v1、现有 session、Prisma 表和数据。
2. **共享客户端契约与桌面原型**：从 packages/contracts 导出稳定的请求/响应
   契约；为原生微信小程序加契约回归；选定桌面优先时使用 Tauri 2 和本地
   前端资源（不是远程网站 WebView），实现安全登录与只读习惯列表。
   **原生客户端的 OAuth Authorization Code + PKCE / 系统浏览器回调、
   会话类型、密钥安全存储须先设计和测试**；不可复用微信 bearer 或
   将 Web Cookie 暴露给 JS。
3. **多端数据操作**：共享应用用例和 API SDK；加幂等请求 ID、离线队列、
   客户端游标与乐观并发冲突提示，先只读同步再开放离线写入。所有数据归属
   仍由服务端 userId 强制限定，保留撤销与更正审计。
4. **独立部署可选**：当 API 与 Next.js 页面依赖解除后，才将 API 移至
   apps/api；Web 以后只消费同一 API。迁移期间反向代理保持旧 /api/v1
   路径与认证行为，不改数据库表、不重置用户会话。

## 已确认的产品决策（2026-11-18）

- **Windows 为首要桌面平台，采用 Tauri 2**：本地前端 + Rust 原生 HTTPS/Windows Credential Manager；不将远程网站直接嵌入特权 WebView。macOS/Linux 非本轮发布目标。
- **手机目前仅支持响应式网站和原生微信小程序**。Android/iOS 独立 App 暂不实施；未来可复用 /api/v1、packages/contracts 和 packages/core 的确定性逻辑。
- 微信小程序：**继续保留原生项目** apps/wechat-miniapp；不要为了 UI
  复用在未验证分包、审核、登录和设备兼容性前贸然迁移到 Taro/uni-app。
- Web：继续维护已有网站和邮箱账号登录；保留 Next.js 服务及 API，暂不强制拆微服务。

## 发布门禁

- npm ci、core tests、TypeScript、PostgreSQL 多用户集成测试、Web 构建、
  微信结构检查全绿；新增 AI 网关负面测试覆盖 SSRF/大响应/跳转。
- 不引入新 Prisma migration，不清空或复制正式用户数据，不公开研究题目、
  原始作答、私有模型密钥或 AI 生成的“能力百分位”。
- 发布桌面/移动客户端前，另需设备端登录安全审查、系统密钥链、权限最小化、
  端到端注销、隐私同意、断网与冲突恢复测试。**本阶段未完成这些门禁。**

## Windows 只读预览落地（2026-11-18）

- apps/desktop：Tauri 2 Windows 本地 UI、Rust API transport、Windows Credential Manager、
  系统浏览器 PKCE S256 授权、回环临时端口和随机 state。授权码 120 秒有效，
  服务端以 HMAC 绑定随机 nonce 并原子消费现有 Session 行，**无数据库迁移**。
- 桌面令牌与 Web Cookie、微信 bearer 明确分离；服务端桌面 scope 仅允许
  GET /api/v1/me 与 GET /api/v1/habits。授权前浏览器显示确认页面。
  浏览器登录继续使用原有 Cookie/CSRF，桌面客户端不接触用户密码。
- 桌面只读列表不持久化个人日记，不做离线写入，不接触私有题库。
  微信和网站原有请求、用户身份与数据结构不变。
- Windows Desktop workflow 进行 Windows Rust 测试；手动配置真实 HTTPS origin
  后才构建未签名 NSIS 预览安装包。**未签名安装包不可当正式发行版**。
- 未来开放桌面写入前须单独设计可审计的请求幂等、乐观版本冲突、
  客户端凭据轮换和撤销、网络恢复、跨设备一致性以及设备端安全测试。
  当前阶段绝不通过扩展 WEB Cookie 或微信令牌权限来绕过这些门禁。
