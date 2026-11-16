# 原创逻辑题库：发布源冻结与结构审计（2026-11-17）

本轮为现有两个 **DEMO / 未校准** 逻辑卷新增持续集成检查，不进行题目版权重新授权、心理计量标定或用户数据收集。

## 运行机制

- 研究脚本 `packages/core/scripts/audit-original-forms.mjs` **仅将** `apps/web/prisma/seed.ts` 中的 `const newForms=[...]` 当作静态 JSON 读取；绝不执行种子文件或连接数据库。
- `docs/research/locks/original-logic-forms-v1.json` 同时锁定整个种子文件的 SHA-256 和 Git blob SHA-1（用于发现意外变更；两者不是独立密钥签名，不能防有权同时修改源文件与锁文件的人）。CI 发生变动就失败；希望修改公开题库时必须创建新版本、审核历史成绩兼容性，并按计划更新锁。
- 12 道原创题按 A/B 两卷分离；每卷 6 题、条件推理/论证证据/数量比例各两题。校验固定的题号顺序、UUID 唯一、互不相同的选项、正确答案键合法及解析文字存在。
- 完全重复的题干阻止合并；*语义相似* 无法由文本完全相同的规则发现，仍需盲审和真实测量。
- 已有题库的答案位置偏向某几个选项：CI 会给出 `ANSWER_POSITION_CONCENTRATION_MAY_CUE_RESPONSES`，**但本轮不重排旧答案或选项**，否则会破坏已有答卷和未完成卷的可比性。
- **重要安全事实：题干及正确答案在公开 GitHub 种子文件中可见。** 这些原始题应保持“演示题”定位，不能把防 API 提前公布成绩误认为能抵御公开代码中答案可查的问题。未来真正独立的测验题库需要隔离、保密内容和评分键发布流程，并验证是否已曝光。

## 使用与交付

`node --test packages/core/scripts/audit-original-forms.test.mjs`

`node packages/core/scripts/audit-original-forms.mjs --verify`

两条检查会加入完整项目 CI。没有数据库迁移、用户数据变更、外部接口变化，原有生产评分保持不变。检查仅能证明题库结构与版本追踪，不能证明构念效度、A/B 等值、可靠变化和科学常模。

采用 [International Test Commission 2017 测验翻译与适配指南](https://members.intestcom.org/files/guideline_test_adaptation_2ed.pdf) 的原则，未来面对不同语言、文化或设备，应独立评估任务的构念一致性及公平性，而非仅凭文本形式相同即视为等价。
