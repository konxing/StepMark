# StepMark 原创题库：独立校准和复测研究方案（2026-11-17）

**状态：正式研究设计草案与可运行的模拟工具；不触发招募、不使用生产用户信息、不改变在线评分。**

## 1. 当前无法越过的测量门槛

- 两套原创逻辑卷 `logic-a-v1`、`logic-b-v1` 各只有 6 题，且每个三个细分能力领域仅 2 题。不能由此估计稳定的领域潜变量、可靠个人变化、常模百分位或临床结论。
- 固定 A→B、7 天间隔的观察不等于两组随机交叉。原始两卷不同答案比例包含题目难度、练习、记忆、时间、状态等成分。
- 外部 ICAR / MaRs 数据可验证研究代码与通用预测方法，不会替代 **StepMark 自己的题目** 及目标人群的独立校准。

## 2. 两阶段、预注册、独立队列计划

**阶段 P0：内容与认知过程验证。** 确定每个能力的构念图谱、可观察任务与明确排除对象。审查语言理解、视力、设备、题目文化背景。建议每个领域构建足够丰富的原创独立题库（研究设计假设：至少 18–24 道/领域作为候选，而不是正式通过标准），包括难度梯度及明确评分键。对少量自愿参与者进行认知访谈，检查他们使用了预期的推理过程，不把程序运行成功视为内容效度。

**阶段 P1：单次大样本校准。** 对愿意单独授权科研数据的成年人以分层配额与可控缺题设计呈现题目。先试点调查填写体验、实际暴露次数和缺失机制，再基于预设的题目区分度/局部独立性/IRT 模型参数恢复模拟，倒推样本与每题有效样本量。研究设计**情景值**：200–300 人用于流程试点；600–1,200 人用于候选题校准；另留至少 200–300 名独立参与者作为冻结后的测试样本。**这些不是经统计功效证明的最低样本量**，尤其若做多组 DIF、3 领域分层或稀疏自适应题库，样本可能需要更多。组间不平衡时必须重新计算功效。任何人不得在不同数据分区中重复出现。

**阶段 P2：随机交叉复测。** 与校准数据分离的研究参与者，在预先记录的随机分配表中进入 A→B 或 B→A，统一语言和答题环境；预先固定 7 天间隔可作为一个研究情景，同时对 3–14 天做独立敏感性设计。记录逐题完成、遗漏、开始/结束时刻、设备浏览器和中断情况（仅采最小必要元数据，明确告知用途）。两种顺序的 B−A 差值分别报告，采用 `research-form-crossover.ts` 的分解结果为**描述性**审核，并对失访原因和完整案例偏差作敏感性分析。若试卷含锚题，锚题必须预先验证结构与不变性；不把重复出现的锚题当作自然独立证据。研究版本和题目内容 SHA-256 必须冻结。

**阶段 P3：盲法独立验收。** 不接触最终保留队列的研究人员先冻结训练样本、题库版本、主假设、主要指标与多重检验规则。能力变化主指标至少应考虑重测信度、练习效应、不同卷等值误差以及真正的外部效标变化。若未能满足这些门槛，只对用户报告正确率和解释性信息，不转换成“推理能力提高 17%”。

## 3. 可复现样本量/敏感性模拟（纯合成）

代码：`packages/core/src/research-crossover-power.ts`，`packages/core/scripts/plan-crossover-power.mjs`。模拟独立的潜在特质（近似标准正态）及每题二元作答，指定两套卷的 log-odds 差、第二次会话 log-odds 效应、每组随机退出概率、题目数量、指定总人数和固定种子。按组估计 B−A 差、普通近似 z 检验，并与**完全无效果**的模拟相比计算频率。输出 **场景下的检出率和零效应时的假阳性率**，不输出真实心理测量功效保证，不代表在线 StepMark 观测值。

示例参数：两卷各 6 或 18 题、160/320/640/960 名被分配的**模拟**参加者、两个假设 logit 效应 0.25 和 0.20、双方独立退出率 15%、250 次蒙特卡洛重复。所得数值仅用于比较设计的响应性，**不能作为真实样本量结论**。实际预注册要检验退出是否非随机、受试者异质性、测量多维性、跨时记忆效应及双指标检验的整体 α 误差控制。

## 4. 具体前置验收和停止规则

1. **许可证与知情同意**：研究授权和产品必需服务分离，用户可以拒绝研究而继续使用；有撤销、数据最小化、删除、导出与访问审计。
2. **研究独立性**：题库和评分键冻结；按参与者隔离训练、调参和最终验证；避免 AI 生成题答案泄露给被试；所有输入仅在研究沙箱处理。
3. **题目质量**：设定异常负区分度、不充分曝光、极端难度、反应时间技术故障和异常缺失检查，问题修正后**重新验证**，不得在最终测试集不断调参。
4. **复测等值**：两种顺序均有足够有效配对；分别报告组间失访、平均间隔和不确定性；没有等值证据不得给出个人提升百分比。
5. **公平性**：对被试主动授权的相关分组，在足够统计功效和保障隐私的条件下开展 DIF、语言适配和设备影响验证；未知分组不得自动推断。
6. **停止门槛**：出现重大答题泄露、题库内容漂移、模型无法收敛、严重项目 DIF、锚题不可用、估计不稳定、系统性失访，或无法保证个人级权限隔离时，停止把研究指标推广为正式能力分数。

## 5. 本轮交付与未交付

**已实现**：纯合成设计模拟、确定性检验和可复现研究 CI；原创题库独立校准与未来随机复测研究规范。

**尚未实现/不可宣称**：自动招募、真实用户实验、任何 StepMark 原创题目的有效 IRT 标定、独立中文成人常模、个体可靠变化认证，以及已经获得足够统计功效的具体 N。推进这些需要独立许可与未来真正的观察数据。

## Executed synthetic study-planning grid (2026-11-17)

The fully synthetic, zero-participant-research [Actions run 43909642089](https://github.com/konxing/StepMark/actions/runs/43909642089) passed fixed-seed tests and executed 250 Monte Carlo repetitions per scenario. These assumptions are purely illustrative: form logit shift +0.25, second-session shift +0.20, random independent 15% attrition in each assignment arm, equally weighted binary items, approximately Gaussian latent variation. Detection is the frequency of rejecting a two-sided unadjusted z-test at α=0.05, for the **simulated** effect, not a real-world power estimate.

| Simulated assigned participants | Items per form | Form contrast detection | Session contrast detection |
| ---: | ---: | ---: | ---: |
| 160 | 6 | 0.624 | 0.472 |
| 320 | 6 | 0.892 | 0.744 |
| 640 | 6 | 0.996 | 0.948 |
| 160 | 18 | 0.956 | 0.868 |
| 320 | 18 | 1.000 | 0.992 |

These rates cannot justify selecting 320 participants or expanding to 18 items without independent construct and effect-size evidence. They do illustrate that a six-item short test could leave substantial uncertainty and that test length matters under a particular assumed item model. Zero-effect false-positive rates were also printed, and **both** contrasts were tested without familywise correction. No programmatic "approved N" is emitted. The frozen experimental consent, randomization, reliability, repeated-exposure, attrition and multiplicity plan remains a prerequisite.

## 2026-11-17: Holm correction and false-positive study upgrade

Earlier sample-size simulations counted two independent-looking nominal 5% tests (form difficulty and second-session change), but two such claims create a multiple-testing family. Holm's 1979 step-down method is now implemented for **exactly two prespecified contrasts**. The report retains earlier unadjusted rates for historical comparison, and adds:
- Holm-adjusted form/session detection rates under assumed effects;
- Holm-adjusted null rejection rate for each contrast;
- **at least one false rejection** (familywise error) under the simulated joint null, with and without Holm.

Both exact two-test critical values (two-sided 0.025 then 0.05) and high-dropout gates have deterministic tests. The Holm procedure only protects nominal familywise alpha when the underlying z tests have valid null distributions; item dependence, missing-not-at-random data, repeated test tuning and lack of construct validity are **not solved** by multiplying p-values. The module remains synthetic-only and not exported to production.

Reference: Holm, S. (1979), *A Simple Sequentially Rejective Multiple Test Procedure*, Scandinavian Journal of Statistics, 6:65–70, https://www.jstor.org/stable/4615733 .
