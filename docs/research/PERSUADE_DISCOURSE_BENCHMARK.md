# StepMark P2: PERSUADE 2.0 论证结构离线验证

**明确的限制：非商业研究专用。** 2024 年 PERSUADE 2.0 作者仓库 https://github.com/scrosseye/persuade_corpus_2.0 明确采用 CC BY-NC-SA 4.0，与一些介绍 PERSUADE 旧项目的通用网页所说的 CC BY 4.0 不能混用。

数据二次整理来源：University of Virginia 的教学子集 https://github.com/HakeoungLee/edis8100-datasets ，固定提交 `6386a0de8d8f3f3bb3bfa7f3e0cc53ab7cc9dc3d`。其 README 说明从作者公开原始 PERSUADE 2.0 中按四个写作题目选出 5,531 篇作文和 63,211 个人工标注的论证片段，不改变这些条目的数值。该子集方便研究，但**不能当作整个 25,000+ 篇的官方独立代表性样本**。

两份原始下载文件在临时 GitHub Actions 进程中做 Git blob SHA-1 校验：
- `persuade-4prompts/essays.csv.gz`，4,307,611 字节，Git blob `da9a77da36f467001442898f357c413aeb3a1215`；
- `persuade-4prompts/discourse_elements.csv.gz`，4,985,952 字节，Git blob `7a6fed4a48ad0b82d7310d3a0123b1c52ac9d3a1`。

每条片段仅用人工标注类型、其文本内容、所在作文的题目与匿名关联 ID。标签可能包括 Lead、Position、Claim、Counterclaim、Rebuttal、Evidence、Concluding Statement、Unannotated。**不读取任何人口属性进入模型**。不用这些学生的身份推断任何人口特征。原始作文和个人标注从不提交仓库、打印到日志、上传产品服务器，数据不会进入商业训练流水线。

## 测量目标与方法

- 这次研究**只检验“片段是什么论证成分”的多分类能力**，不是测量写作优劣或人的表达能力。
- 从同篇文章来的所有标注片段必须分配到同一个集合；对规范化全文 hash 后分组，进一步阻止完全重复作文跨集。训练与留出采用固定散列 80/20。没有使用留出答案训练文本向量器。
- 对照模型是**每个题目最常见的片段类型**、**长度 + 题目 SGD 分类器**、**片段文本 TF-IDF + 长度 + 题目 SGD 分类器**。
- 主要指标：Accuracy、macro-F1、weighted-F1；同时按人工标签和作文题目输出召回率/精确率/F1，并提供以留出作文为聚类单位的 1200 次 Bootstrap Accuracy 改进区间。
- 该任务类别极不平衡时，accuracy 可能虚高，所以 macro-F1 以及每类召回缺一不可；不得只根据 accuracy 做推广。
- 这不是跨新题目的严格外推，数据也不是成年中文表达或口语场景的证据；不是 StepMark 正式能力评分体系的一部分。

执行：独立 GitHub Actions 工作流 `.github/workflows/research-persuade-discourse.yml`。

作者须同时获得原始研究署名，若在与商业目的有关的产品中训练、发布衍生参数或分发数据，应首先获得其他明确授权。当前仓库中的输出只记录汇总统计，不向 StepMark 正式能力评分提供模型权重。
