# StepMark — Agent 接续开发任务书（2026-11-10）

## 当前完成状态（请务必先阅读仓库，不要重做已有功能）

StepMark 是 Web + 微信小程序的独立多用户 Alpha。代码已经有：
- Next.js / Prisma 7 / PostgreSQL / npm workspaces，已提交 lockfile 和正式 SQL 初始迁移；
- 邮箱注册/验证、登录退出、密码重置与验证邮件重发（需配置 Resend）；
- 原生微信 wx.login -> 服务端 code2Session -> 独立用户身份及 bearer session；
- 服务端用户隔离、行为记录幂等与频率限制、Web CSRF 校验、会话吊销；
- 习惯列表、执行事件、试验性四题自动化指数；
- 原创实验性逻辑推理题库、一次性提交、确定性评分（不是人群常模）；
- 用户分页导出和网页端密码二次确认删除；
- PostgreSQL 真实多用户集成测试和 CI 构建/审计；静态目录缓存、数据库索引及小型本地性能检测；
- 文档 docs/research/RESEARCH_AND_FORMULAS.md、docs/architecture/SECURITY.md、ARCHITECTURE.md、DEPLOYMENT.md。

请在已有分支基础上继续，不要改动 AI Chat Web 仓库。任何改动必须复用已存在的用户身份、数据契约、测量证据和模型版本体系。

## 下一阶段优先级（严格排序）

### P0 — 安全上线前的剩余硬门槛
1. 正式 TLS/域名 + 边缘 WAF/限流，代理可信 IP 透传规则；目前缺完整部署范本与真机测试。
2. CSP 取消当前的 unsafe-inline，结合 Next App Router 以 nonce/hash 方式实施，并验证不影响生产资源/性能。
3. 邮件供应商上线与抗滥用：验证域名、重试策略、邮箱注册/密码重置 anti-enumeration、费用上限、异常监控。
4. 测试密码重置并发重放、验证码重发、账户删除与数据导出跨租户隔离，增加失败/超时/数据库故障场景。
5. 数据库运行账户只读/写入最小权限与迁移专用账户，考虑安全的 PostgreSQL RLS 作为 defense-in-depth，但不能以 RLS 替代服务端 ownership 检查。
6. 隐私/用户同意/留存/第三方处理方/未成年人/微信审核合规。隐私页面目前仅为说明草案。
7. 备份、恢复演练、密钥轮换、日常数据库过期记录清理脚本的部署调度；操作日志不能记录密码、token或未经授权的原始作答。
8. 在生产硬件和目标用户并发下进行非破坏式压测：公开读/认证读/写各自 p50/p95/p99；制定并验证 SLO，监控 DB 连接耗尽与 AI 成本。

### P1 — 科学测量核心
1. 增加原创任务的**独立题型与平行测验**，复测题不能重复计为独立进步。初始逻辑题未校准，不得包装为人群能力分。
2. 建立明确量规（表达结构、清晰度、逻辑、例证等）与双人工标注 gold set；AI 评分输出 provisional + 版本+证据；必须报告信度与分歧。
3. 量表信度、测量不变性、题目区分度；样本不足时不得启用 IRT 潜在能力声称。
4. 能力趋势以可比较任务为基础，显示误差/样本量/证据来源；**行为完成不自动加能力分**。

### P2 — 习惯自动化与最少操作的日常体验
1. 现有 automaticity API 目前用 4 项试验性问卷，需增加可选、低频的前端体验（如每两周一次），不要每天强制填写；正式 SRBAI 中文版使用前验证授权与语言适配。
2. 明确行为机会、触发线索、启动习惯 vs 执行习惯，允许用户纠错、补记，不能把缺失数据等同失败。
3. 训练计划与任务难度由 AI 推荐，但 AI 无权直接改写统计结果；留下用户可追溯的版本与更改理由。
4. 支持微信账号与邮箱账户经双方身份验证的**显式绑定**，禁止基于相同昵称/邮箱自动关联。

### P3 — AI 教练与解释性能力报告
1. 使用 packages/core/src/ports.ts 中的 AIJudge/IdentityResolver 适配边界，提供供应商可切换的结构化输出模型。
2. 人工样本校准、漂移测试、预算/配额、超时/降级、限流和提示词注入防护。
3. 完成能力—习惯假设图谱与独立复测结果分析，不把相关系数称为因果。
4. 建立可复核模型与结果解释页面，保留模型、量规、任务和提示词版本。

### P4 — AI Chat Web 集成（此阶段**不得改动**旧项目）
- 只准备用户同意、受限读取、短期签名身份令牌/OIDC 的接口契约与 mock 测试。
- 未来共享能力摘要，不能共享原始 session cookie、密钥、数据库表或未经用户同意的详细私人记录。
- StepMark 应始终可独立部署。

## Agent 工作方式与验收标准
- 检查仓库与 GitHub Actions 最近一次成功的 CI；先修复红色 CI，再开展新需求。
- 实施新功能须更新 README、API 契约和安全文档，并补充单元/真实 PostgreSQL 集成测试；多用户隔离是必须验证的前置条件。
- 改动数据模型必须提交新的 Prisma SQL 迁移；不得使用 db push 修改生产数据库。
- 运行 npm ci、npm run db:generate、npm run test、npm run typecheck、npm run db:deploy --workspace @stepmark/web、npm run db:seed --workspace @stepmark/web、npm run test:integration --workspace @stepmark/web、npm run build、npm run audit:prod。
- 不把代码编译成功称为科学测量已验证，也不把本机 benchmark 称为生产性能已达到 SLA。
- 小步提交 PR，记录哪些测试通过、哪些未运行，保留能回退的版本；不自行放宽默认安全门槛。

## 数学 v0.2 接续任务（本次已完成基础计算与洞察 API）

- 已实现：后验 Beta-Binomial 习惯完成概率（不等同自动化）、数学修正的曲线最小二乘拟合与 AICc、EAP 和信息/时间选题接口、纵向卡尔曼滤波、按用户聚合的习惯统计 API、相关单元/隔离测试。
- 下一步 1：验证中文自动化量表的条目质量及授权，建立 8–12 周重复测量，并以时间留出法比较习惯拟合与常数基线；不得根据 AICc 单独宣布习惯形成。
- 下一步 2：建立至少数十个经许可的原创逻辑题库与标定采样流程；在足够样本、项目参数稳定、量尺链接之后才启用 EAP 自适应模块；记录曝光控制与内容平衡的统计。
- 下一步 3：用独立平行题目获得可比较能力量尺与测量 SE 后，再为纵向滤波设计 UI。对比简单基线，做时间序列验证、误差与公平性检验。
- 下一步 4：如果要以最低负担引导训练，比较测量信息收益/用户成本，但须设置最小观测数、用户知情、退出权和非歧视性控制。

## Habit growth / reflection / maintenance implementation (2026-11-11)

**Implemented:** structured optional user initiation rating 0..4, personal note with explicit AI consent, private multi-tenant storage, AI asynchronous coding interface and worker, visual experiment progress (v1), evidence gating, reduced polling and app-entry review due dates, user opt-out, data export and account deletion, cross-user/CSRF tests. Web and WeChat mini-program surfaces now expose the progress and feedback UI.

**Incomplete — do not claim implemented:**
1. Real scheduled deployment of the AI processing worker and retries/queue monitoring with provider billing quotas; configure secrets only at deployment.
2. Calibration of the natural-language coder against diverse human-rated diaries, translation of an authorized automaticity instrument, validity/uncertainty of heuristic 0–100 progress and comparison with simpler baselines.
3. Official WeChat subscribed-message or web-push review reminders; current review is only shown when users open the application. Need explicit notification opt-in and user-configured frequency.
4. Causal evidence of improvement in linked skills: perform independent baseline/retests and intervention controls. **Never increase a capability score from habit progress alone.**
5. Production privacy law review, raw diary retention/deletion policies and third-party agreements; official Mini Program developer tool/test device UI validation.
6. If users object to self-report burden, allow one-tap default and only request free text when prediction uncertainty benefits from it.

## Review/consent follow-up implementation (2026-11-11)

**Implemented now:** daily opportunity states (done / eligible missed / cue absent), progress not penalizing no-cue days, batch due-review endpoint, proactive in-app due-review surface on web and WeChat, early review after a sharp drop in initiation ease, explicit revocation of per-entry AI consent, first-party diary deletion, model output removal, processing-in-flight conflict, cross-user/CSRF integration tests, and a mini-program-compatible PUT route.

**Next improvements:** audit-trail explainability and data export now implemented; remaining review cadence controls, dedicated privacy history, state machine with true retention/expiration, safe deletion request integration with AI providers, production platform validation and notification consent. Continue validity testing; the visual percentage and intervals are provisional settings rather than confirmed psychological scales.

## 研究数据集与纵向校验进展（2026-11-11）

**完成：**
- 找到与习惯研究相关的 Edgren 2025 OSF 纵向数据、Buyalskaya 2023 行为数据、openESM 2026 长期体验采样数据目录；另有 Gera/Barak/Schonberg HabitApp 2024 原始实验 CSV。
- 实际运行 Gera HabitApp 的固定校验基准：133 参与者、1,056 条条件/阶段记录，按参与者配对的 post-valued 与 post-devalued 行为对比，hash 与 schema 校验。此结果只描述实验任务，不是习惯量表效度证据。
- 实现带源版本固定、许可记录和缺失值/重复值检查的独立研究工具；外部源不可达不会让用户应用 CI 失败。
- 实现可重复运行的逐人时间顺序留出验证程序，比较渐近习惯曲线与个人恒定/最近值基准，使用每人等权 RMSE/MAE；不混淆个体内训练拟合与未来预测误差。

**接下来：**
1. 取得并审核 Edgren 数据的真正表结构、逐项自动化量表、缺失情况及许可；当前 OSF API/网站在本研究环境返回 403，**未得到这份原始纵向数据**，不得声称验证通过。
2. 将真实研究表按官方 codebook 映射到 `participant_id,day,effective_repetitions,automaticity_0_100`。对习惯**减弱**数据应建立合理衰减模型，不能强迫使用单调增加模型。
3. 对每一种独立人群分别进行时间前推比较，优先验证用户日常复查是否优于固定 7/14/28 天提醒，记录漏报与反馈负担，不得从事后调参直接宣称“预测准确”。
4. 若数据样本数量足够，拟定预注册的模型评估指标/阈值、bootstrap 个体级 CI 和跨情境迁移测试；未超越简单基准的模型不得启用为自动决策。
5. 后续以用户自愿授权的真实 StepMark 数据建立长期效度队列，不得直接把公开研究对象的数据导入生产租户。
