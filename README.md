# StepMark / 个人能力与习惯成长平台

**当前状态：多用户 Alpha（开发预览；不可直接视为正式公网生产版本）。**
Web + 微信小程序使用统一后端 API。每个用户有独立的身份、习惯与测评证据。
**唯一长期维护分支为 `main`。** 开发成果已通过 PR 合并到主分支；本地部署与更新均以 `main` 为准。

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
git checkout main
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

## 新增：习惯形成进度与低频复查（实验性）

- 控制台执行一次习惯后，可以选择一个自然启动等级，也可以不填；可附 600 字以内感受。未提交文字仍不影响行为记录。
- 通过“查看记录 / 习惯成长进度”显示 0–100 实验性进度条。重复次数只是部分信号；文字或自评才能提供自动化程度证据。示例：20 次且轻微纠结 ≈33%，90 次且跨时间多次自然启动 ≈91%（均不是科学阈值）。
- 形成较稳定的候选习惯进入“维护观察”，应用内会低频提示复查，用户可关闭。**未启用微信订阅消息或自动推送**。
- AI 是可选的异步服务：只有用户单独勾选同意，且服务端配置 `AI_HABIT_PROVIDER`、`AI_HABIT_MODEL`、`AI_HABIT_API_KEY` 后，本条文字才会排队等待分析。
- 开发者要在可信服务器的计划任务中运行 `npm run habits:analyze --workspace @stepmark/web`。**仅启动网页服务不会自动运行 AI worker**。AI 结果是带原文引句的暂定分类，不会直接改写能力分数。
- 用户数据导出覆盖个人感受原文和可审计的 AI 分类结果；账户删除级联清除个人感受。
- 详细公式、参数和局限：`docs/research/RESEARCH_AND_FORMULAS.md` 第11节。数据库迁移使用 `db:deploy`，不可在生产使用 `db:push`。


## 习惯复查与隐私控制 v1.1（2026-11-11）

- 记录每日机会时区分三态：**已执行**、**出现机会但未执行**、**当天没有触发机会**。最后一种不进入执行率分母，也不会直接降低习惯进度。一个每日机会只登记一次；如果状态填错，当前 API 会拒绝用不同内容覆盖（409），需要在未来专门实现安全的更正流程。
- 服务端 `GET /api/v1/habits/due` 会批量检索**当前用户**需要复查的活跃习惯，只返回最多 10 条。网页控制台和微信小程序主页在进入时显示复查入口，**不会自动发推送**。后端批量统计机会数并读取有上限的最近感受，避免每个习惯触发多条数据库瀑布查询。
- v1.1 复查策略：自然启动程度近期有显著下降时约 6 天复查，维持稳定时约 28±2 天，其他情况约 7–14 天。算法是一套可调整的**产品调度策略**，不是科学预测得出的最佳周期；偶发漏做不等同习惯失效。
- 最近感受现可查看、删除；允许对单条感受撤回**后续** AI 分析授权。撤回时丢弃平台内由 AI 派生的标注，同时保留用户自己的评分和文字；删除则移除整条感受。处理已经开始时会明确返回 409，而不是错误宣称阻止已经在路上的 AI 请求。此前外传的数据不能通过 StepMark 自动从供应商处收回。
- 微信 `wx.request` 不支持标准 `PATCH`；复查设置和 AI 授权撤回在小程序使用 `PUT`，网页仍可使用 `PATCH`。两个方法都使用相同的多用户所有权检查。
- 新增相应 PostgreSQL 集成测试：三态分母统计、跨用户复查列表、感受权限与撤回、处理中不可取消、微信 PUT 兼容。请以最新 GitHub Actions 结果判断当前分支是否通过。

## 研究数据集验证（2026-11-11）

已新增**可复现的真实公开研究数据基准**，与正式用户数据库完全隔离。

- **已运行的外部数据：** HabitApp 研究的 `core_table.csv`，GitHub commit 与 blob SHA 固定；自动核验文件完整性、133 位参与者的 1,056 条实验条件记录，并进行参与者内条件配对比较。查看 [研究数据目录与校验协议](docs/research/DATASETS_AND_VALIDATION.md)。
- `node packages/core/scripts/validate-habitapp.mjs`：在可信研究环境按固定版本下载约 59 KB CSV，检查来源并只输出聚合指标；不把原始参与者数据放入项目或生产数据库。
- 独立 GitHub Actions `research-data.yml`：实际运行公开数据校验，**与主应用构建 CI 分离**，避免公共研究服务器临时不可用影响用户功能。
- `packages/core/src/validation.ts`：长期自动化指数的时间前推检验，对每个参与者用前 70% 观测拟合、后 30% 测试，比较常数/最近观察/渐近曲线的真实预测误差、缺失率和个体覆盖率。
- `node --import tsx packages/core/scripts/evaluate-longitudinal.mjs --input /private/data.csv --manifest /private/rights.json`：本地离线数据适配器；要求真实的独立自动化指标、许可和来源确认、SHA256 匹配，不对外上传参与者原始数据。**它尚未对 OSF 纵向样本运行实证验证**，因为本环境未取得该研究的数据文件。

注意：**真实行为次数配对分析已经完成，但它不能校准 StepMark 的 0–100 习惯进度。** 正式调节该进度的参数，需要独立的长期习惯自动化数据，不能用没有对应量表的健身或实验次数去拟合。


## 习惯记录安全纠错（2026-11-11）

- `GET /api/v1/observations?habitId=UUID` 返回当前用户最多 60 条记录，新增 `revision` 字段。
- `PUT /api/v1/observations/:id` 要求 `{ "expectedRevision": 0, "eligible": true, "completed": false }`；使用原子版本检查和事务内追加更正历史。并发陈旧版本返回 409，跨用户记录返回 404；网页要求同源校验，小程序使用 bearer token。
- 不允许将关联了感受记录的执行事件改为未执行或无机会，除非用户先删除对应感受，避免污染已有自动化证据及第三方 AI 授权。
- 同一机会以状态为幂等判定依据，客户端稍晚重试不会因时间戳不同返回虚假冲突；真正的改状态必须走 PUT。
- Web 控制台、小程序的近期记录均提供状态纠错入口；修改历史仅保存在后端，不向其他用户展示。使用新增的 Prisma SQL 迁移后方能启用。
- 新增 PostgreSQL 集成测试涵盖同源、跨用户、无效状态、并发版本竞争、审计记录、汇总统计与关联感受保护。此功能未单独通过真实微信设备与生产压力测试。

## 更正证据可查看、可导出（2026-11-11）

- `GET /api/v1/observations/:id?offset=0`：验证用户身份和记录归属后返回事件当前状态、最新 20 条更正明细及 `nextOffset`，按更正版本倒序分页。禁止跨用户读取，归档习惯的历史仍可读取。响应 `private, no-store`。
- 更正历史明细包含旧状态、新状态、修改版本、来源和时间；网页和微信小程序均在“最近记录”处提供查看和逐页加载，不必手动访问 API。
- `GET /api/v1/account/export?kind=corrections&offset=0`：在原有账号导出中增加完整审计记录；`kind=events` 现在包含当前 `revision`。网页“导出 JSON”自动涵盖 `corrections`。
- 不增加能力分、不伪造习惯完成次数，不导出其他用户的修改记录。账户删除时更正历史随习惯事件级联删除。

## 独立思维测验与跨时间证据 v1（2026-11-11）

- 新增两套**原创、题目不重复**的逻辑推理短卷，每卷 6 题；覆盖条件推理、论证与证据、数量与比例三个类别，每类 2 题。原有 4 道演示题仍在后端保留；新页面默认使用独立 A/B 卷。
- 新增 `Task.formCode`、`skillCode`、`formOrder` 与正式 Prisma SQL 迁移。种子脚本幂等创建 12 道新题，历史作答保留。必须执行 `npm run db:deploy --workspace @stepmark/web`、`npm run db:seed --workspace @stepmark/web` 后使用。
- `GET /api/v1/assessment-forms`：返回仅属于当前用户的批次完成情况、分类证据、复测开放时间和（双卷完成后）原始正确率差异；只有整卷完成才返回逐题答案和解析，所有响应禁止缓存。
- `GET /api/v1/tasks?construct=reasoning.logic&form=logic-a-v1`：仅返回当前用户未完成的本卷题目，题目答案在测验结束前不可通过此接口读取。B 卷使用 `logic-b-v1`。
- `POST /api/v1/assessments`：新题卷答题只确认保存，不提供即时对错或解析。B 卷必须完成 A 卷，且自 A 卷最后一次提交起至少间隔 **7 天**；服务端对直接提交 B 卷同样执行限制。
- Web `/assess` 提供选卷、进度、可复测时间、完整卷后的逐题解析、按题型的描述性证据及两次原始正确率对照。
- **科学限制：** 两卷仅覆盖类似类别，尚未心理测量学等值，不能声称“平行卷已校准”；每类仅 2 题。原始正确率差异不等于能力变化，完成习惯也不能直接提高能力值。请勿向用户显示能力百分位/诊断。
- 覆盖多用户隔离、答案不提前泄露、间隔限制、防接口绕过、一次性提交与报告私密性的数据库集成测试；不替代人体试验、专业量表校准或人工题目审校。
