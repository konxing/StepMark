# 预测与判断能力：可复核的概率校准研究模块 v1（2026-11-14）

## 交付内容
纯函数 `packages/core/src/forecast-calibration-audit.ts` 和本地离线脚本 `packages/core/scripts/evaluate-resolved-forecasts.mjs`。不会写入用户账户、构造能力百分位、自动调用 AI 或下载外部数据。脚本要求逐字节 SHA-256、来源版本、许可、用途授权、事前固定基准策略，否则拒绝执行。只打印来源元数据与聚合结果，不输出事件 ID。

数据约束：
- 每个结算结果唯一 `eventKey`；不允许同一事件重复计分，以防多次预测虚增样本量。
- 预测时间 `forecastAtMs` 严格早于结算 `resolvedAtMs`；基准预测时间 `referenceAtMs` 不晚于用户预测时间；结算不晚于给定评估时点。**调用者仍须通过可信审计日志提供真实的时间戳，纯数学无法验证人为伪造的时间。**
- `forecastProbability` 和事前基准均须为 [0,1]，结果为真正已结算的二元 0/1。不得以研究文本或事后事实替代。
- 基准相对 Brier Skill = `1 - mean((p-y)^2) / mean((p_ref-y)^2)`；基准误差为 0 时返回 `null`，预测差于基准可为负数。与其他人的分数不能当作统一智力等级。
- 同时报告 Brier、log loss、五个预先固定的校准区间、平均预测概率、真实发生频率与探索性的 Expected Calibration Error。对绝对错误的 0%/100% 信心，log loss 返回 `null` 并明确标记无限损失事件数量，禁止暗中裁剪概率制造漂亮分数。
- 小于 30 个不同结算事件时状态为 `insufficient_evidence`，不报告校准误差；阈值是产品研究防误用保护而非统计学证明。可传入预先冻结的时间分界，报告早晚期间误差，防止仅看总体掩盖漂移。
- 即使满足 30 件也只返回 `descriptive_only`：主题、信息来源、难度和事件相关性可能影响分数，不可据此宣称通用的判断能力。

## 研究数据与公开来源
- 概率评分基础：Brier (1950), https://doi.org/10.1175/1520-0493(1950)078%3C0001:VOFEIT%3E2.0.CO;2 ；固定概率分箱与误差诊断：scikit-learn calibration documentation https://scikit-learn.org/stable/modules/calibration.html 。
- 本轮**尚未取得能够提供真实“预测前已冻结概率 + 结算 + 基准 + 独立事件 ID”的公开心理学样本**，因此没有虚构外部验证通过。研究工具仅有合成确定性测试数据。
- 与仓库已验证的 ICAR、SRBAI、ESM 不同，测试题作答、习惯日记和一般问卷不是概率预测事件，**不能**混在这一指标中。
- 将来若添加原生预测入口，需单独的多租户数据模型、可信时间戳、用户可撤回/可导出、结算来源权利及隐私校验，在得到明确许可和独立验证后才能显示用户级表现。禁止凭研究模块自动更新用户能力值。

## 离线复现
`node --import tsx packages/core/scripts/evaluate-resolved-forecasts.mjs --input predictions.csv --manifest rights.json`

CSV 首行必须精确为：
`event_key,forecast_probability,reference_probability,outcome,forecast_at_ms,reference_at_ms,resolved_at_ms`

manifest JSON 必须包括 `rightsConfirmed`、`citation`、`sourceUrl`、`sourceVersion`、`license`、`referencePolicyVersion`、`sha256`。不要将原始参与者预测记录、密钥或隐私材料提交到 GitHub。
