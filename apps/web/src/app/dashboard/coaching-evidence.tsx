import type { CoachingForm, CoachingOverview } from "@/lib/ability-coaching";
import styles from "./capability-coach-panel.module.css";

function formStatus(form: CoachingForm) {
  if (form.correct !== null) return `答对 ${form.correct} / ${form.total} 道`;
  if (form.status === "completed") return "已完成，记录待核验";
  if (form.status === "ready") return "可以开始";
  if (form.status === "in_progress") return "答题中";
  if (form.status === "unavailable") return "测验暂不可用";
  if (form.availableAt) return `${new Date(form.availableAt).toLocaleDateString("zh-CN")} 开放`;
  return "完成初测后开放";
}

function FormEvidence({ heading, form }: { heading: string; form: CoachingForm }) {
  const skills = form.skills.filter((skill) => skill.correct !== null);
  return (
    <article className={styles.evidenceCard}>
      <h3>{heading}</h3>
      <p>
        <strong>{formStatus(form)}</strong>
      </p>
      {form.completedAt && form.correct !== null && (
        <p>
          完成于{" "}
          <time dateTime={form.completedAt}>
            {new Date(form.completedAt).toLocaleDateString("zh-CN")}
          </time>
        </p>
      )}
      {skills.length > 0 && (
        <ul>
          {skills.map((skill) => (
            <li key={skill.code}>
              {skill.label} {skill.correct} / {skill.total} 道
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function RetestEvidence({ overview }: { overview: CoachingOverview }) {
  const { baseline, retest, rawDifferencePoints } = overview;
  return (
    <>
      <div className={styles.evidenceGrid}>
        <FormEvidence heading="独立初测 · A 卷" form={baseline} />
        <FormEvidence heading="独立复测 · B 卷" form={retest} />
      </div>
      {rawDifferencePoints !== null && (
        <p>
          复测与初测的正确率相差 {rawDifferencePoints > 0 ? "+" : ""}
          {rawDifferencePoints} 个百分点。
        </p>
      )}
      <p className={styles.caveat}>
        正确题数反映这两份公开短卷上的表现。跨卷难度、练习效应和测量误差仍未校准，能力变化暂无法判断。
      </p>
    </>
  );
}

export function LinkedTrainingHabits({
  habits,
  onViewHabit,
}: {
  habits: CoachingOverview["linkedHabits"];
  onViewHabit: (habitId: string) => void;
}) {
  if (habits.length === 0) return null;
  return (
    <div className={styles.result}>
      <h3>已关联的训练习惯</h3>
      <ul>
        {habits.map(({ id, title, progress, recordedTrainingBetweenTests }) => (
          <li key={id}>
            <button type="button" className="text-button" onClick={() => onViewHabit(id)}>
              {title}
            </button>
            <span>
              已执行 {progress.completed} / {progress.eligible} 次机会 · 自评 {progress.ratings} 天
              · 习惯进度 {progress.score.toFixed(1)} / 100
            </span>
            {recordedTrainingBetweenTests !== null && (
              <div>初测和关联生效后，已记录 {recordedTrainingBetweenTests} 次复测前练习。</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
