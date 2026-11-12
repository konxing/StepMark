# StepMark P3-A：线索—机会—执行—自动启动的证据语义（研究模块）

当前版本 `packages/core/src/habit-opportunity-evidence.ts` 实现独立的**纯函数审计**：不读写数据库，不修改生产 API/小程序，不调用 AI，也不调整 `habit-progress-v1`。支持在开发期验证未来新增事件字段的含义与缺失处理。

## 为什么不应该把所有行为合成一次“打卡”

- **是否遇到情境线索（cueEncountered）**：`true / false / null`。不遇到预设线索不必然表示懒惰或失败。
- **是否存在合格执行机会（eligibleOpportunity）**：`true / false / null`。机会缺失不能放入完成率分母。
- **是否执行（performed）**：`true / false / null`。记录未知和真实未执行不同。
- **启动是否自然（initiationAutomaticity）**：本人直接报告的 0–4 有序分类，`null` 为未作答。该等级只能与当次已执行的行为关联，不能由次数推断。0 代表用户明确报告最低级别，不等于没有填写。

该语义参考 Gardner, Phillips & Judah (2016) 对 habitual instigation 与 execution 的区分，以及此前已验证的 Edgren OSF 数据中 cue encounter 与行为执行分离的必要性。**这些文献与数据并未验证 StepMark 当前所有评分权重或事件分类工具的效度。**

## 不确定性和 AI 证据

- `source="user_explicit"` 为明确用户本人提供的记录；`source="ai_interpretation"` 必须关联实际用户消息 ID 和证据引句。
- AI 解释均标记为 **provisional**，不会进入“已确认执行机会/执行率/本人直接评分”的分子或分母。聊天中没有明示的日期、线索和次数不能编造；自然语言解析与意图消歧目前仍未实现。
- `observedAdherence` 仅在出现**确定的、合格机会、且执行情况已记录**时计算：`performedEligible / (performedEligible + missedEligible)`。它是观察到的条件执行率，不是习惯形成概率。潜在选择性报告仍可能产生偏差。
- 事件键必须在**同一用户同一习惯**范围唯一。未来数据库迁移须附加 ownerId、habitId 索引及幂等更新/审计，不能跨用户或跨习惯合并机会。
- 无线索/无机会/缺报时保持未知或显式“无机会”，不扣已证实的自动化进度。AI 派生记录经过授权后也不能擅自覆盖用户本人记录。

## 实现边界和数据迁移守门

已建立单元测试，覆盖三态缺失、已执行与未执行的分母、自动启动等级 0 与 null、AI 候选不进入确认数据、源消息缺失及重复键拒绝。它们证明**代码遵守定义**，不证明定义可以准确感知真实人的心理状态。

要落地到生产应用还需要**先单独确认数据库变更方案**：保留旧事件；新建显式字段并记录 schemaVersion、source、evidence quote、request idempotency、user opt-in、撤回/更正和来源证据生命周期；增加多用户访问测试、旧记录回填仅为 null、回滚与在线数据迁移演练。只有外部自动启动量表与独立数据验证后才可能考虑习惯评分政策升级。

当前状态：**研究语义 P3-A 已加入核心库，但没有接入任何生产写入或 UI。**
