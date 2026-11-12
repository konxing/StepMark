# StepMark P2 扩展：PERSUADE 2.0 少数论证标签的跨题目诊断

## 背景与观察

先前正式研究结果（见 [P2 汇总](./P2_WRITING_AND_ARGUMENT_RESULTS_2026-11-13.md)）显示：
- Counterclaim 召回率约 13.93%；
- Rebuttal 召回率约 6.18%；
- 简单 TF-IDF 模型的整体 Accuracy 67.54%、Macro-F1 0.5147。

这些事实使“真实用户反论证能力自动评分”**不具备产品准入条件**。本次是一个新的、事先固定比较方案的非商业研究实验，不能修改线上 StepMark 的评分。

## 试验设计：留出整个作文题目（LOPO）

- 数据：PERSUADE 2.0 的四题教学整理子集（原始作者 CC BY-NC-SA 4.0，**仅允许非商业研究**），源与 Git blob SHA 参见 [PERSUADE 验证设计](./PERSUADE_DISCOURSE_BENCHMARK.md)。任何研究数据不得用于商业模型训练、正式产品 API、用户数据存储或公开题目材料发布。
- 每次选定 1 个作文题目作为完整测试集，另 3 个题目作为训练集，重复 4 次。某篇作文的所有论证标注不能跨训练和测试；跨题目完全相同的规范化全文直接拒绝。
- 为了评估跨题目外推，**不将作文题目标识作为特征**；只使用片段长度与训练阶段提取的 TF-IDF 文本特征，不依赖留出题目的词汇统计。
- 预先固定三种同架构模型：`unweighted`（不加权）、`sqrt_capped`（按训练集类别频率计算平方根逆频率，并限制 0.5–3.0）、`balanced`（scikit-learn 内置的训练集反频率权重）。各模型其余超参数一致，所有模型都报告，**不得根据外层测试集挑选赢家后宣称独立验证**。
- 主要指标按每个独立留出题目分别输出 Accuracy、Macro-F1、Counterclaim 与 Rebuttal 的 Precision、Recall、F1；同时提供四轮合并后的诊断。合并后的统计不等于具有四个独立研究队列的新样本。
- 探索性“产品安全检查”：任一少数类 precision 或 recall 低于 0.50 即标注低表现；这个条件仅为**事先定义的筛查门槛**，不是心理计量效度或线上发布许可。

## 重要限制

1. 本次题目全来自已发布数据，之前研究者已知同源数据的总体特点；这不是全新独立外部样本，也不能避免作者风格在不同作文题目间可能出现的相关性。
2. 类别权重能改善弱类召回，却可能牺牲 Precision 和整体准确率，必须成对报告，不做片面宣传。
3. “识别反驳片段”不同于“评价一个人的反驳质量”，更不等于真正的论证能力、思维能力。
4. 完全遵守 CC BY-NC-SA 4.0 的非商业研究边界；不保存第三方文本或逐篇预测输出，不使用外部 AI API。
5. 本次运行的实证结果需以 GitHub Actions 的最终状态与日志为准，不提前宣称弱类已改善。

复现：`.github/workflows/research-persuade-rare.yml` 运行 `validate-persuade-rare.py`，先执行 `test_validate_persuade_rare.py` 合成测试。固定相同的 SciPy/NumPy/scikit-learn 版本与源 Git commit/SHA。
