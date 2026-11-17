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
