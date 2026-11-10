# StepMark / 个人能力与习惯成长平台

**当前状态：多用户 Alpha（开发预览；不可直接视为正式公网生产版本）。**
Web + 微信小程序使用统一后端 API。每个用户有独立的身份、习惯与测评证据。
Github 的 `main` 仍保留旧状态；开发工作通过 `feat/research-backed-foundation` PR 审查合并。

## 已实现

- 邮箱注册与验证、登录/注销、密码重置、有限速验证邮件重发。
- 微信 `wx.login` 服务器端凭据兑换、微信 OpenID -> StepMark 用户映射及 24 小时 bearer 会话。**微信账户与邮箱账户暂不自动合并**，防止未经授权的身份绑定。
- 服务端强制用户隔离的习惯创建、列表、归档及每次有效机会记录。重复提交幂等；不把打卡等同能力加分。
- 4 题实验性逻辑推理任务的只读发布与一次性提交、客观确定性评分、历史证据；**不是已校准的综合能力值**。
- 四项试验性行为自动化问卷算术指数（尚未验证为中文 SRBAI）。
- 用户数据分页导出、需要重新输入密码的网页账户删除。
- PostgreSQL + Prisma 7、正式初始化 SQL 迁移、连接池、复合索引、静态目录缓存、记录上限。
- CSRF 来源校验、HttpOnly/Secure 生产 Cookie、登录和写入限流、密码 scrypt 哈希、令牌哈希存储、重放与跨用户访问测试。
- CI 使用 npm lockfile、PostgreSQL、迁移、种子、集成测试、类型检查、Next.js 构建和 npm audit。
- 数学 v0.2：Beta-Binomial 习惯执行概率、误差区间、修正后的习惯曲线拟合、预测的事前基准 Brier Skill Score，以及仅供校准数据使用的 EAP 自适应选题与纵向滤波。
- 控制台“查看记录”改为读取服务端聚合统计（只返回必要计数和不确定性，不传整批原始行为日志）。

## 目录

```text
apps/web/                Next.js 页面、认证及 REST API、Prisma 模型和迁移
apps/wechat-miniapp/     原生微信小程序（需要你的 AppID 和合法 HTTPS 域名）
packages/core/           与数据库/模型供应商无关的可验证公式
packages/contracts/      版本化 Zod 请求/响应数据结构
docs/research/           论文、公式来源、模型局限
docs/architecture/       设计边界、AI Chat Web 未来集成、安全与部署
docs/agent/              后续实现计划与验收标准
```

## 本机启动（PostgreSQL 需要先安装、启动并创建数据库）

环境：Node.js 22+、npm 10+、PostgreSQL 16+。示例以 Windows PowerShell 为例：

```powershell
git clone https://github.com/konxing/StepMark.git
cd StepMark
git checkout feat/research-backed-foundation
npm ci
Copy-Item apps/web/.env.example apps/web/.env
# 编辑 apps/web/.env，设置你的本地数据库 URL、RATE_LIMIT_SECRET、APP_ORIGIN 等
npm run db:generate
npm run db:deploy --workspace @stepmark/web
npm run db:seed --workspace @stepmark/web
npm run dev
```

开发地址：http://localhost:3000。进入 /register 注册，/login 登录，/dashboard 查看习惯，/assess 进行实验性题目。若未配置邮件服务，注册接口会返回 503；必须配置自己的发信服务后才能验证邮箱。

**不要将示例密钥直接用于正式环境，环境文件不得提交到 Git。**

微信：使用微信开发者工具导入 `apps/wechat-miniapp`，在项目设置替换正式 AppID，并填写 `config.js` 的 HTTPS API 域名。后端 AppSecret 只存在于服务器环境变量，且要在微信后台登记合法域名。

## 检查与性能验证

```bash
npm run test
npm run db:generate
npm run typecheck
npm run test:integration --workspace @stepmark/web   # 需要已迁移并初始化的测试数据库
npm run build
npm run audit:prod
node apps/web/scripts/perf-http.mjs                   # 需要先启动本机服务
```

性能脚本只对本机公开只读 URL 发请求，输出延迟 p50/p95 与错误率；它不能替代正式并发压测。

## 上线前必须完成

在生产环境开启用户注册前，按 [安全门槛](docs/architecture/SECURITY.md) 进行独立审查：TLS、正式域名、数据处理合规和隐私政策、WAF/边缘限流、CSP 无 unsafe-inline、数据库最小权限与备份恢复、短信/邮箱投递审查、性能压力测试等。任何测试通过不意味着已完成这些运营与安全事项。

## 关键研究原则

**习惯完成率 ≠ 习惯自动化 ≠ 能力。** 任务原始分不是标准化能力分；跨时间比较须有独立测试、量表校准及误差分析。详见 [研究公式](docs/research/RESEARCH_AND_FORMULAS.md)。

## 未来与 AI Chat Web 的对接

保留 `ExternalIdentity` 用户映射及独立身份边界；将通过授权的 OIDC / 后端互信令牌读取有用户同意的能力摘要。**尚未改动 AI Chat Web。**

License: Apache-2.0. 引入任何第三方认知测验或量表前另行确认许可。

## 数学模型 v0.2

习惯洞察：`GET /api/v1/habits/:id/insights` 只返回用户本人的完成率、Wilson 区间、先验公开的 Beta(1,1) 平滑预测以及最近的实验自动化指数。请勿将“完成率 / 平滑预测 / 自动化程度 / 能力值”混为一个分数。

研究模块：`packages/core/src/adaptive.ts` 和 `longitudinal.ts` 实现贝叶斯 EAP、自适应选题和考虑时间/测量误差的状态空间滤波；现有四道演示题未经校准，**不会**启动这些算法。全部假设、公式和文献见研究文档第 10 节。
