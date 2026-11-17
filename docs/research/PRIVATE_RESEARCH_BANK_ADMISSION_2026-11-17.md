# StepMark 私有研究题库离线准入 v1（2026-11-17）

本轮建立的是**不包含任何真实保密题目**的准入检查工具，供将来独立研发新版原创题库。它不启用新的正式测验、不导入数据库、不更改原 A/B 卷或用户评分。

## 为什么不能在公开 GitHub 创建“保密题库”

当前 `apps/web/prisma/seed.ts` 中两套 `logic-a-v1 / logic-b-v1` 演示卷的题干及答案键公开可见，因此即使 API 做了“答完才给解析”的限制，也不能作为真正防答案泄露的独立测验。新增题目不能放入 GitHub、Next.js 前端、微信小程序静态包或公开日志；**不要因为新题库有 SHA-256 就误认为它自动加密或保密**。

## 已实现

- `apps/web/scripts/audit-private-research-bank.mjs`：只接受仓库目录**之外**的 JSON 文件，设置 128 KiB 上限、UTF-8 严格解码、JSON 白名单结构，拒绝包含出版字段、用户资料或任意额外字段。
- 固定 `research-logic-a-v2` / `research-logic-b-v2` 两个**研究草案标识**（不属于当前生产可接受的正式卷号），每卷至少 18 道题，三类能力候选题的数量相同；校验随机 UUID、顺序、四个不同选项、正确键合法、题干/解析存在、两卷题干不重复。
- 只报告分卷总数、按技能计数、A/B/C/D 答案键分布和题干文本近似重复的**数量**；不会输出原始题、正确选项、解析、题目 ID 或原始文件路径。内容哈希用于固定版本，不提供隐私保障或版权授权。
- 输出固定状态 `BLOCKED_PENDING_INDEPENDENT_CONTENT_AND_SECURITY_REVIEW`；**通过结构审计不等于可以发布**，不授予数据库写入或前端访问权限。
- 完整 CI 以虚构模拟题生成临时文件，仅运行结构、安全和错误处理回归测试，不含真实新题。

## 使用方式（Windows）

把独立原创的研究草案 JSON 文件存放到公开仓库和网盘自动分享目录之外，例如本机具有严格 ACL 的独立工作文件夹。示例结构如下，实际输入必须满足两卷各至少 18 道题以及每技能数量相等，不能直接用以下占位对象通过：

```json
{
  "kind": "stepmark-private-research-bank-v1",
  "bankVersion": "research-logic-v2",
  "constructCode": "reasoning.logic",
  "researchOnly": true,
  "forms": [
    {"code": "research-logic-a-v2", "items": []},
    {"code": "research-logic-b-v2", "items": []}
  ]
}
```

在仓库根目录执行：

```powershell
node apps/web/scripts/audit-private-research-bank.mjs --input "D:\stepmark-private\research-bank.json"
```

**暂时不要把这条路径的文件提交 Git、上传任何第三方模型或复制进部署包。** 建议使用操作系统文件权限限制访问，并由研究负责人进行脱敏后的内容审查；真实上线还需要独立的受试者知情同意、评审、题库发布权限设计、数据库加密/备份保护、最小暴露与失效轮换、实验随机分配和独立心理测量验证。

## 限制与下一阶段验收

此脚本没有检测内容是否真实原创、题目正确答案是否科学准确、跨卷等值、IRT 校准、中文成年常模、知识泄漏与心理效度。近似重复只采用文本双字符相似度作为**需人工审核的告警**。内容版本发布和密钥管理**尚未实现**。任何真实题目都应先经双人盲审、版权确认、内容效度检查与题库隔离，再考虑是否具备进入研究系统的条件。

现有 `GET /api/v1/tasks` 仅允许当前两卷的显式编号；`POST /api/v1/assessments` 会拒绝未知卷号。新研究草案不会通过生产接口暴露或评分。无新增 Prisma 迁移。

## 2026-11-17 API fail-closed regression

Added real PostgreSQL multiuser integration coverage for a deliberately *misconfigured* research draft Task with `publishedAt` in the past. The authenticated generic task list must omit its ID, prompt and explanation; `GET /api/v1/tasks?form=research-logic-a-v2` must respond 400; answer submission by guessed Task UUID must fail 503 before any attempt is created; and the existing form overview must not include it. The test leaves no research item in the database. This regression is a current-code protection boundary, **not** an authorization to import private questions or deploy a production private testing workflow.

The CLI now emits only allowlisted error codes even for OS filesystem failures, preventing accidental disclosure of a researcher's absolute private-bank path through stderr.

## 2026-11-17 fail-closed unformed task authorization

Found and closed an important remaining publication bypass: previously any Task with `formCode=null` and a past `publishedAt` timestamp was accessible as a standalone task. If a future import accidentally omitted the research form code, an unreviewed item could be served by `GET /api/v1/tasks?construct=reasoning.logic` and receive immediate correctness feedback from `POST /api/v1/assessments`.

Now both read and submit paths explicitly allow only the four already-public demo task IDs at version `demo-1`. Known A/B demonstration forms retain their existing independent deferred feedback rules. **No unpublished research task can be authorized by setting `publishedAt` alone**, even if it lacks `formCode`. A PostgreSQL integration test simulates this exact accidental misconfiguration and verifies no leaked content, no attempt creation, and continued demo availability.

Adding a truly new task or construct will require an intentional, reviewed update to the server-side allowlist/publishing policy, rather than silently broadening scope. This is an additional API authorization boundary, not a secret question vault or psychometric validation.

## 2026-11-17 独立审核证据绑定（新增）

新增 `apps/web/scripts/audit-private-review-evidence.mjs`。在**仓库之外**保存审核清单，并将其绑定到离线私有题库文件的完整 SHA-256。清单包含三种不同的审核职责（内容、心理测量、版权与安全）、六个固定维度、匿名审核引用标识、审核日期和通过/需修订结论。脚本检验三个审核角色存在、引用标识不重复、清单及内容的版本一致、记录不超过 180 天；只输出计数、源哈希和阻断状态，**不会输出题干、答案、审核者引用标识或文件路径**。

私有清单 JSON 形状示例（务必替换为真实源文件计算的 SHA-256，以下为无效占位）：

```json
{
  "kind": "stepmark-private-bank-review-v1",
  "bankSha256": "<64个十六进制字符>",
  "reviewers": [
    {
      "reviewerRef": "reviewer-example001",
      "role": "content",
      "reviewedOn": "2026-11-17",
      "decision": "pass",
      "checks": {
        "constructFit": "pass",
        "answerKeyVerified": "pass",
        "languageReviewed": "pass",
        "rightsConfirmed": "pass",
        "exposureRiskReviewed": "pass",
        "noSensitiveContent": "pass"
      }
    }
  ]
}
```

实际审核时必须三条不同角色记录（`content`、`psychometrics`、`rights_security`），而不是上述只展示结构的一条。两个文件均须在公开仓库之外，离线运行：

```powershell
node apps/web/scripts/audit-private-review-evidence.mjs --bank "D:\\stepmark-private\\research-bank.json" --reviews "D:\\stepmark-private\\review-evidence.json"
```

**关键限制：** 本工具只核验**审核记录的格式与源版本绑定**，不能验证审核者身份、独立性或审核意见真实性。角色引用标识不是数字签名。即使三个角色都填写通过，程序仍固定输出 `BLOCKED_PENDING_AUTHENTICATED_REVIEW_AND_CALIBRATION`，不会授予生产题库发布、数据库写入或真实用户测量权限。后续必须设计身份认证的签核流程、题目版权审核与独立效度验证。

## 2026-11-17 Ed25519 签核工具（已实现）

除了早期仅记录审核角色的“未验证声明”，新增独立的 **Ed25519 离线签名与核验流程**：`apps/web/scripts/private-review-crypto.mjs`。使用 Node 内置 `crypto`，不依赖网络、AI 模型或数据库。

信任根为**仓库之外**由项目 OWNER 独立管理的本地 JSON 注册表：

```json
{
  "kind": "stepmark-offline-reviewer-trust-v1",
  "reviewers": [
    {
      "reviewerRef": "reviewer-sample001",
      "role": "content",
      "publicKeySpkiPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
    }
  ]
}
```

实际注册表须包含三名不同审核者分别对应 `content`、`psychometrics`、`rights_security`。Reviewer 私钥（PKCS#8 PEM）必须由各自独立产生、保存在仓库外且使用系统 ACL/密钥管理工具保护；不要把私钥内容上传 GitHub、AI、网盘或提交到应用。

每个签名的输入是独立 `entry.json`，其字段为 `reviewerRef`、`role`、`bankSha256`、`reviewedOn`、`decision`、`checks`，其含义与前述审核清单一致。生成与核验命令：

```powershell
node apps/web/scripts/private-review-crypto.mjs --sign --entry "D:\stepmark-private\entry.json" --key "D:\stepmark-private\reviewer-key.pem" --output "D:\stepmark-private\signed-content.json"
node apps/web/scripts/private-review-crypto.mjs --verify --bank "D:\stepmark-private\bank.json" --reviews "D:\stepmark-private\signed-reviews.json" --trust "D:\stepmark-private\trusted-reviewers.json"
```

将三个独立生成的 `signed-*.json` 放入外部 `signed-reviews.json` 的 `reviews` 数组，同时设 `kind: "stepmark-signed-bank-review-v1"` 与完整 `bankSha256`。角色名单、审阅时间、审核结果和所有六项维度均纳入签名消息；篡改签名后不得通过，绝不根据传入审核清单自行信任某个新公钥。支持一次性保存签核文件（不能覆盖），保护私有路径不进入错误输出。

**安全限定：** 验证成功仅意味着受信任公钥对应的私钥签署了所述内容，不代表审核者真实身份已通过法律意义的 KYC，不代表内容效度、版权授权或真人独立校准成功。输出仍为 `BLOCKED_UNTIL_REAL_CALIBRATION_AND_AUTHORIZED_RELEASE`；本工具**没有生产发布 API 或数据库写入权限**。信任注册表自身也需要 OWNER 的离线可信保管、密钥轮换和撤销策略，不能让提交审核的同一方替换信任注册表来伪造审核。
