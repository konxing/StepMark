# 习惯形成及习惯—能力关系：研究测试入口

从 [sources.json](sources.json) 读取 13 项来源与明确的数据状态。此前 [数据总目录](../README.md) 保留。这个目录的数据均为研究级，不接入生产数据库、用户评分或前端；不要求用户做 A/B 卷。原始个体数据不能与论文汇总混用。

## 可以直接读取的真实数值

| 文件 | 真实来源 | 粒度 |
|---|---|---|
| [routine-formation-published-groups.csv](routine-formation-published-groups.csv) | van de Vijver, Brinkhof & de Wit (2023), §3.4, DOI [10.3389/fpsyg.2023.1140366](https://doi.org/10.3389/fpsyg.2023.1140366) | 6 行已发表组均值与标准差；空 n 表示未从对应分析核实样本数 |
| [routine-formation-published-effects.csv](routine-formation-published-effects.csv) | 同论文 §3.4、3.6.2、3.6.3 | 15 行已发表统计效应；不是个体数据 |
| [motor-habit-gd3-aggregate.csv](motor-habit-gd3-aggregate.csv) | Gera et al., [source revision](https://github.com/ranigera/Habit_and_Automaticity/blob/5a0b7450d1e188c3165206434a99ceb6324bc81d/ANALYSIS/Generalization_Dataset_3/DATABASES/DV_ALL_SITES.csv), [Zenodo](https://zenodo.org/records/18568645) | 306 条实际读取记录的两组汇总；不含参与者 ID、站点、原始试次 |
 
前两份 CSV 是从 CC BY 开放论文抽取的数值事实，保留署名和章节，转换为长表（非论文原始文件）。原研究 68 名年轻人与 63 名年长者，四周每天执行安慰剂服用；SRBAI 为 0–100，五个时点为 1、7、14、21、28 天。量表原始题目不复制。末日 SRBAI 与整个四周期 SRHI 的子项不是同一测量窗口。r、B、t、chi_square、partial_eta_squared、cohen_d 不是可混合平均的效应指标；p_operator 区分精确 p 与上界。零假设不显著不证明关系为零；不能从组均值重建个人轨迹或相关。

第三份实际读取 GitHub CSV（blob 504fda84a4030ae5eddbb92141b189506baac0e4）时检查 newID 唯一且五列各组都有有效数值；按 group 求均值，不重新解释原始变量，CHANGE_SCORE 使用源文件列。它是实验室动作/结果贬值范式，不能当 SRBAI 或日常习惯形成百分比。上游部分文件含平台账户标识，禁止复制；MIT 软件许可不能推定为原始参与者数据的再发布许可。仅保存非识别汇总数值和来源。

## 最优先的真实纵向数据与获取方式

1. **van de Vijver 2023** 同人认知任务与习惯数据：大学数据目录明确 CC BY 4.0；Figshare v4 原文件/API 本次网络无法读取。使用下面脚本先查看版本、许可、文件清单；只有确认直接文件许可、字典、隐私后才下载到仓库外。
2. **Fiorella 2026** 每日重复、意图、执行、自动化（175 人 / 9,416 行）；仓库已有固定 ZIP SHA-256 的验证程序，可直接使用。不同问法/学期不混合；使用过去重复数，不能利用未来真实执行预测。
3. **Edgren** 真实逐日习惯减弱、触发情境；复用已有脚本；不是正向养成曲线。HABIRUPT 已有随机试验及缺失数据审计。
4. **HabitWalk** 每日触发、动作、自动化和步数；数据与 R 代码来源已定位，但尚未下载及核实许可；不将设备未佩戴视为未执行。
5. **自控与行为** 及 **Measuring context–response associations**：补充习惯和任务表现/自控的关系。前者自控量表不是客观认知能力；后者需要独立任务表现效标和明确时间。
6. Gardner 2024 的 16 个数据集用于探索低负担自动化自评，只有许可允许的部分公开；研究排除了纵向养成轨迹，不能用其直接拟合成长速度。Stojanovic 与 van der Weiden 原始数据需联系作者，不能伪称公开下载。

## 给后续 AI 的运行指令

在仓库根目录执行（Python 3.10+，仅标准库）：

```bash
python packages/core/scripts/check-habit-ability-fixtures.py
python packages/core/scripts/fetch-routine-formation.py
# 确认权利和隐私后，在仓库之外下载某个具体文件；ID 来自上一条命令
python packages/core/scripts/fetch-routine-formation.py --file-id ID --out /path/outside/repository
# 真实上游 Gera 数据独立校验（不落盘原始数据）
python packages/core/scripts/check-habit-ability-fixtures.py --verify-motor-source
```

已存在的 Fiorella、Edgren runner 位于 packages/core/scripts/，参见 [历史验证](../../DATASETS_AND_VALIDATION.md) 和对应 GitHub Actions；权限不明的原始研究数据只做许可范围内的隔离研究，不提交、不发送第三方 AI。网络失败必须明确记录，不能以生成数据冒充真实数据。

## 科学量化与验收

- 习惯形成分别测量触发机会、实际执行、启动自动化、执行过程自动化；无机会/未执行/未知不同。SRBAI 四项均值可以在原量表许可内做参照，不能把聊天 0–4 分类等同原量表。参考 Gardner et al. 2012 (https://doi.org/10.1186/1479-5868-9-102)。
- 成长曲线候选 A(t)=A_inf-(A_inf-A_0)*exp(-k*t)；t 分别定义为已知日期或已发生有效重复数，严禁未来重复泄漏；k 个体差异大，与最近观测、历史均值、线性等基线按参与者分层和时间前推比较。参考 Lally et al. 2010 (https://doi.org/10.1002/ejsp.674)、Gardner et al. 2022 (https://doi.org/10.1080/23311908.2022.2041277)。不把 66 天或 55 次当固定阈值。
- 习惯→能力应使用同人独立能力测量，控制基线能力、任务、年龄/情境等混杂因素；比较只用基线和加入习惯证据的预测表现，报告留出误差与不确定性。未显著、负相关、群体异质都要保留，不准由习惯完成次数机械加能力分。上述已发表数据就有工作记忆与自动化的负相关，不能推广为习惯损害能力。
- 若要研究习惯促进能力的因果效果，需要有独立、时间上后续、与训练任务不同的能力测量与合理对照；目前这些资料不能验证 StepMark 思维/表达/观察/预测综合分。
- 数据级验收：同一人不得跨训练/测试集合；缺失不设为 0；先固定模型和指标，再看留出结果；用简单基线作为门槛；明确样本量、覆盖、MAE/RMSE、置信区间，新增指标不优于旧版就不替换。对话识别另外需要用户原话与独立人工/自评配对数据，现有数据不能替代。
- 无需增加普通用户表单或强制测评。独立测量可用于有明确同意的外部验证或可选真实任务，而不是默认工作流。

状态：本次实际汇总了 Gera 源 CSV 与已发表的真实统计数据；尚未下载 Figshare/新 OSF 原始数据；新增脚本尚未在联网环境独立运行。不能宣称模型已经验证。
