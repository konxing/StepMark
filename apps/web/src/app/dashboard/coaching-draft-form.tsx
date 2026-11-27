import { useState, type FormEvent } from "react";
import type { CoachingSuggestion } from "@/lib/ability-coaching";
import styles from "./capability-coach-panel.module.css";

export type HabitDraft = { title: string; action: string; cue: string };

const actionLimit = 500;

export default function CoachingDraftForm({
  suggestion,
  focusLabel,
  disabled,
  saving,
  onSave,
}: {
  suggestion: CoachingSuggestion;
  focusLabel: string;
  disabled: boolean;
  saving: boolean;
  onSave: (habit: HabitDraft) => void;
}) {
  const { draft, source } = suggestion;
  const [title, setTitle] = useState(draft.title);
  const [cue, setCue] = useState(draft.cue);
  const [action, setAction] = useState(() => {
    const completeAction = [
      draft.action,
      `最低行动：${draft.minimumAction}`,
      `完成标准：${draft.successCriteria}`,
    ].join("\n");
    return completeAction.length <= actionLimit ? completeAction : draft.action;
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ title, action, cue });
  }

  return (
    <section className={styles.result} aria-labelledby="coaching-draft-title">
      <h3 id="coaching-draft-title">
        {source === "ai" ? "AI 训练方案" : "内置训练方案"} · {focusLabel}
      </h3>
      <p>{draft.reason}</p>
      <p>每次约 {draft.minutes} 分钟。</p>
      <dl className={styles.planDetails}>
        <dt>练习示例</dt>
        <dd>{draft.example}</dd>
        <dt>忙时的最低行动</dt>
        <dd>{draft.minimumAction}</dd>
        <dt>完成标准</dt>
        <dd>{draft.successCriteria}</dd>
      </dl>
      <h4>确认训练习惯</h4>
      <p>调整成你愿意实际执行的版本，保存后会自动关联逻辑推理初测与复测。</p>
      <form className={styles.habitDraft} onSubmit={submit}>
        <label>
          习惯名称
          <input
            required
            minLength={2}
            maxLength={180}
            value={title}
            disabled={disabled}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          触发情境（选填）
          <input
            maxLength={250}
            value={cue}
            disabled={disabled}
            onChange={(event) => setCue(event.target.value)}
          />
        </label>
        <label>
          具体行动
          <textarea
            required
            minLength={2}
            maxLength={actionLimit}
            value={action}
            rows={4}
            disabled={disabled}
            onChange={(event) => setAction(event.target.value)}
          />
        </label>
        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.primary}
            disabled={disabled || title.trim().length < 2 || action.trim().length < 2}
          >
            {saving ? "正在保存…" : "保存并关联训练习惯"}
          </button>
        </div>
      </form>
    </section>
  );
}
