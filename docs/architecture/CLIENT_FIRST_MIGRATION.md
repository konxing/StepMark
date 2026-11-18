# ADR-002 — 客户端优先的软件架构（阶段 1：后端边界与 AI 网关）

状态：**分阶段实施**。本文件是实施路线，不代表桌面端已可安装或移动端已完成。
当前 main 的 Next.js 同时承载网页和 /api/v1，原生微信小程序通过同一 API
访问 PostgreSQL；packages/core 是无数据库的确定性计算，packages/contracts
提供 Zod 输入契约。**不能直接删除 apps/web**，否则小程序也会失去服务。

## 目标边界

    原生微信小程序 ───────┐
    桌面软件（待选 Tauri 2）├── HTTPS /api/v1 ── 身份/授权 ── 应用用例 ── PostgreSQL
    移动软件（待确认）──────┤                          │             │
    Web（暂缓 UI）─────────┘                          │             └── packages/core
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

## 技术决策（尚待用户确认）

- 桌面 Windows/macOS/Linux：**Tauri 2 优先**（安装包较小，前端可复用 TS，
  原生功能必须最小权限）；Electron 作为需要 Node 生态原生插件时的备选。
- 如果“软件”主要指 iOS/Android：优先评估 React Native/Expo，独立使用
  packages/core 与 API 契约；Flutter 需要跨语言重写核心逻辑。
- 微信小程序：**继续保留原生项目** apps/wechat-miniapp；不要为了 UI
  复用在未验证分包、审核、登录和设备兼容性前贸然迁移到 Taro/uni-app。
- Web：暂缓新增页面，保留原服务直至 API 独立部署与回滚能力完备。

## 发布门禁

- npm ci、core tests、TypeScript、PostgreSQL 多用户集成测试、Web 构建、
  微信结构检查全绿；新增 AI 网关负面测试覆盖 SSRF/大响应/跳转。
- 不引入新 Prisma migration，不清空或复制正式用户数据，不公开研究题目、
  原始作答、私有模型密钥或 AI 生成的“能力百分位”。
- 发布桌面/移动客户端前，另需设备端登录安全审查、系统密钥链、权限最小化、
  端到端注销、隐私同意、断网与冲突恢复测试。**本阶段未完成这些门禁。**
