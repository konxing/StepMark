# StepMark 公开研究数据与 AI 测试交接（2026-11-28）

本文件是后续 AI 开展外部数据验证的入口。实际取得的真实数据、仅核实授权的来源、授权待确认的候选、合成样本分别标注。详见 [JSON 数据源清单](datasets/open-dataset-catalog-2026-11-28.json)、[已入库的真实汇总数据 CSV](datasets/openneuro-learning-habits-aggregate.csv)、[此前已执行研究](DATASETS_AND_VALIDATION.md)。本轮不改变任何生产评分、数据库、用户授权或测评题库。

## 1. 本轮新增的来源及优先级

| 优先级/维度 | 数据、来源与权利 | 推荐验证任务 | 现状与禁止事项 |
|---|---|---|---|
| P0 习惯、自动化、执行与认知 | van de Vijver, Brinkhof & de Wit 2023 [日常习惯形成 v4](https://doi.org/10.6084/m9.figshare.23309678.v4), [论文](https://doi.org/10.3389/fpsyg.2023.1140366)；机构索引报告 CC BY 4.0，直接文件许可尚未核实 | 日常服药执行、SRBAI/SRHI、认知/执行功能之间的区别；先查 README、时间表和测量时点 | 候选；直接数据页读取失败，尚未下载；健康相关原始记录不上传；禁止把依从率当自动化 |
| P0 习惯与学习/反应 | [OpenNeuro ds008039 v1.0.0](https://openneuro.org/datasets/ds008039), DOI 10.18112/openneuro.ds008039.v1.0.0；CC0 | 重复试次、响应时间、正确/错误/未知分离、重复事件去重 | 已实际读取 15 个行为 TSV，入库 3 行真实汇总；实验室选择任务，不是日常习惯形成效标 |
| P0 思维/表达 | LeGris et al. 2025 [H-ARC](https://doi.org/10.17605/OSF.IO/BH8YQ), [数据论文](https://doi.org/10.1038/s41597-025-05687-1) 报告数据 CC0 | 1,729 人，800 道 ARC 任务，真实解题步骤、正确性、自然语言解释；检验思维过程评分与实际表现的关系 | 许可由论文确认，未下载；按人和题拆分、核对刺激权利；不把文字解释当认知能力标准分 |
| P0 预测 | [Good Judgment Project 数据 V1](https://doi.org/10.7910/DVN/BPCDH5)，Harvard Dataverse CC0 | 真实人的事前预测和结果；Brier、校准、基准差异、时间切分 | 授权元数据已核实，未下载；仅保留可解析且时间在结果之前的记录 |
| P0 预测 | [ForecastBench](https://github.com/forecastingresearch/forecastbench-datasets) CC BY-SA 4.0；固定 2024-07-21 人类预测批次 | 对照专家预测、普通人及基准；按事件而非预测条数评估 | 已核实仓库许可、3 个原文件 blob 和大小，未读数据内容；普通人文件仅 133 字节，可能是指针，不直接当数据；遵守署名及相同方式共享 |
| P1 学习/行为 | [OULAD](https://archive.ics.uci.edu/dataset/349/open+university+learning+analytics+dataset)，CC BY 4.0，[论文](https://doi.org/10.1038/sdata.2017.171) | 以学习行为、作业评分和未来成绩验证记录缺失、时间泄漏、任务表现预测 | 未下载；不把点击、学习频率或课程分数当习惯自动化/一般能力 |
| P1 表达/论证 | [Webis-ArgQuality-20](https://doi.org/10.5281/zenodo.3780049)，[数据字典](https://webis.de/data/webis-argument-quality-20.html) | 1,271 段论证、20 主题、约 42,000 对比较；逻辑/修辞/辩证/相关性分开建模 | 公开数据说明已核实，Zenodo 访问限流、直接许可待核实；确认原文权利前禁止下载入库和 AI 外传 |
| P1 习惯结构 | [Creature of Habit 数据 v1](https://data.mendeley.com/datasets/t8fs63pgrf/1)，索引报告 CC BY 4.0 | 27 项日常惯例与自动化量表结构的交叉验证 | 直接页面未取得，许可/数据待核实；横断面不能拟合个人成长曲线 |
| P2 习惯实验 | [Control becomes habitual early on when learning a novel motor skill](https://doi.org/10.7281/T1/FWDYPW)，JHU 数据 V1，CC BY 4.0 | 实验控制、运动学习、重复表现的统计检验 | 未下载；不能用动作技能结果校准日常习惯进度 |
| P2 对话证据识别 | [HABIT-Bench](https://huggingface.co/datasets/hollyming/HABIT-Bench)，分领域许可 MIT / CDLA-Permissive-1.0 / CC BY 4.0，见 [third-party notices](https://huggingface.co/datasets/hollyming/HABIT-Bench/blob/main/THIRD_PARTY_NOTICES.md) | 长期历史弱证据、条件、反例、情境变化；测试聊天抽取准确率 | 合成用户历史，不是真实被试；未下载，逐领域核实授权后再用；不能用其校准心理指标 |

既有 Fiorella、Edgren、HABIRUPT 更接近日常习惯自动化，应继续用作纵向算法的优先外部基准；其已有研究验证不意味着具备商业再分发权。ICAR、MaRs-IB、ASAP、PERSUADE 等分别针对自己的任务和人群，不能校准 StepMark 自有题库或把英语作文分作为中文表达能力常模。

## 2. 已实际收集的真实数据与复现

来源：Hugo Fluhr, Viktor Timokhov, Stephan Nebe, University of Zurich, OpenNeuro ds008039 v1.0.0。官方 [数据许可](https://github.com/OpenNeuroDatasets/ds008039/blob/916b60cec1e5230d8fe5ae23d702efed30d45471/dataset_description.json) 为 CC0。上游 README 说明 70 名参与者、2 次学习 run 与 1 次测试 run，同一会话；不是连续多日。

本轮通过 GitHub 读取固定版本的前五个参与者编号的全部 3 个行为 TSV（15 个文件，Git blob 标识已记录）。仅使用 trial_type=response 行，逐文件拒绝重复 trial；correct=1/0 分开计数，其余未知；RT 只计有限正值，单位秒。按 run 聚合，不含个体响应、ID、影像、自由文本或人口学变量。样本选择是固定便利子集，不是随机抽样；统计为观测响应行汇总而非全部预定试次。

| run | 事件行 | 响应行 | 正确 | 错误 | 正确性未知 | 正值 RT 数 | 平均 RT 秒 |
|---|---:|---:|---:|---:|---:|---:|---:|
| learning 1 | 2858 | 469 | 416 | 53 | 0 | 469 | 0.553595 |
| learning 2 | 2852 | 466 | 448 | 18 | 0 | 466 | 0.502961 |
| test 3 | 3397 | 677 | 493 | 6 | 178 | 677 | 0.521954 |

真实数据已读取、解析并聚合（不是模拟），共 9,107 事件行、1,612 响应行，178 个响应正确性未知。尚未通过独立本地脚本/CI 进行字节复验；不能推断第三 run 的未知标记是缺报、错误还是实验设计，须查 codebook。重复事件行不可当独立试次，未记录 response 的试次不可凭空判错。RT/正确率的变化可能源于任务与练习效应，不能证明能力提高或习惯养成。

联网环境在项目根执行：
```bash
python packages/core/scripts/audit-openneuro-learning-habits.py
```
此复现脚本按 manifest 锁定的 commit 读取 15 个文件，独立计算 Git blob SHA-1、复算各列并对照 CSV；不保存或上传原始文件。它是研究数据获取/完整性测试，不是 StepMark 心理测量有效性试验。

## 3. 交给后续 AI 的数据获取操作

1. 读取 JSON manifest；对 status 为 candidate 的条目先从原始发行页或 API 查许可、数据字典、研究伦理及第三方材料权利；未确认时停在元数据层。对 metadata-only 的 CC0/CC BY/CC BY-SA 数据也要锁文件版本并做隐私检查，禁止误称已下载。
2. H-ARC：从 OSF bh8yq 按 [作者说明](https://github.com/Le-Gris/h-arc/blob/463f88cd6522b73197b010bfd7e2373f6bc25bc5/README.md) 下载 osfstorage-archive.zip 到仓库外的研究目录，查 data/summary_data.csv、data/data.csv 和 README；忽略 survey 中的反馈、人口学及撤回文件。冻结压缩包 SHA-256 和实际文件名，不能把 GitHub 的 ARC 题目 CSV 当成人类行为数据。
3. GJP：打开 Harvard Dataverse DOI V1，下载对应问卷预测和问题解决文件，先确定概率格式、提交时间、结果公布时间、重复预测处理、二元/多元类型。ForecastBench：JSON manifest 给出固定的 repo、commit、path、blob SHA-1；通过 raw.githubusercontent.com/{repository}/{commit}/{path} 获取并验证 Git blob（计算方式见复现脚本），检查 LFS 指针和完整数据；对 2024-07-21 的问题、预测、结果按官方 schema 联接。固定可用时点，不事后挑选预测或基准。
4. OULAD：UCI DOI/官方发布页下载数据，先审查 assessments、studentAssessment、studentVle 等表，时间单位是相对课程起点；不要导入人口学数据；按学生及课程/呈现批次拆分。
5. 习惯相关数据：例行行为研究 v4、COH、Webis 必须先核对直接数据发行页，写入独立的 manifest 后再下载；不可根据文章开放许可推出数据许可。HABIT-Bench 仅在许可允许的领域做合成聊天测试。
6. 原始数据保存在仓库外的研究目录，绝不写入生产数据库、前端或 AI 服务商；如需 LLM 评价，须独立确认数据权利与隐私（尤其自由文本和身份信息）。提交时只保留许可明确且无个体识别风险的汇总、必要代码和带署名的版本锁。不能为了测试方便而降低现有授权与用户隔离。

## 4. 不反向优化的验收方案

- **习惯**：不同量表分开，先比较最近观测、个体均值与旧策略；按人留出并做时间前推；MAE/RMSE、有效覆盖率、错误稳定判定、等级一致性（加权 kappa）同时报告。无机会、未执行、未知必须分离；自动化不等同次数。没有用户直接自评和对话的配对标签时，不能把现有纵向研究当成聊天抽取的精度证据。
- **思维/表达**：以 H-ARC 的真实任务结果及步骤与独立人工评分论证为候选效标，冻结评分 rubric、遮蔽结果和模型身份、按人/题/话题拆分，报告 Spearman、MAE、加权 kappa/ICC（明确类型）、缺失率及不同语言/任务/辅助条件的误差。预测或观察能力不得凭 AI 自评置信度决定。
- **预测**：使用在事件结果之前冻结的概率，Brier=mean((p-y)^2)，Brier Skill=1-BS/BS_reference（基准为零时不定义）；按独立事件聚类区间，避免高频更新过权。禁止未来信息泄漏；未解决不进入准确率分母，报告覆盖。
- **聊天识别**：合成挑战与真实标注分开。测试明确完成、否定、计划、假设、转述、无机会、日期不明、多习惯、用户撤回、AI 代做、跨轮指代。将 precision、recall、false positive、abstention、每次聊天追问数量与延迟分别与现有版本比较，不以调用次数/表单数量增加换取虚假改进。不得强制 A/B 卷。
- 只有通过外部独立验证及真实 StepMark 用户效度测试，才可升级生产评分规则。数据来源发现、汇总解析、代码测试、模型验证四个状态独立记录，不合并成“已验证”。

## 5. 当前尚缺证据

目前没有找到可直接证明“中文成人自然聊天中的思维、表达、观察、预测综合能力分”有效的开源标准数据，也没有找到同时具备长期自然对话和同人独立 SRBAI 标签、明确可商用的现成完整样本。需继续检索或在未来经同意收集配对验证数据。不能用公开认知题库的统计结果替代该验证，也不能把本文件中建议的模型当成已上线功能。
