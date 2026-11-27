"use client";

import { useEffect, useRef, useState } from "react";
import {
  logicSkills,
  type CoachingOverview,
  type CoachingSuggestion,
  type LogicSkill,
} from "@/lib/ability-coaching";
import { aiErrorMessage } from "@/lib/ai-errors";
import CoachingDraftForm, { type HabitDraft } from "./coaching-draft-form";
import { LinkedTrainingHabits, RetestEvidence } from "./coaching-evidence";
import styles from "./capability-coach-panel.module.css";

const endpoint = "/api/v1/ability-coaching";
const focusLabels: Record<LogicSkill, string> = {
  conditional: "条件推理",
  evidence: "论证与证据",
  quantitative: "数量与比例",
};

type Operation = "ai" | "built_in" | "save";
type Notice = { message: string; error?: boolean };

async function requestCoaching<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, { cache: "no-store", ...init });
  if (response.status === 401) {
    location.assign("/login?next=/dashboard");
    throw new Error("请登录后继续。");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    const code = body?.error?.code;
    if (response.status === 429) throw new Error("操作有点频繁，请稍后再试。");
    if (code === "VERIFIED_BASELINE_REQUIRED") throw new Error("请先完成可核验的 A 卷。");
    if (code === "HABIT_QUOTA_EXCEEDED")
      throw new Error("活跃习惯数量已达上限，暂时无法新增训练习惯。");
    if (code === "TRAINING_TARGET_UNAVAILABLE") throw new Error("逻辑推理训练关联暂不可用。");
    throw new Error(aiErrorMessage(code) ?? "操作未完成，请检查测评状态后重试。");
  }
  return response.json() as Promise<T>;
}

function errorNotice(error: unknown): Notice {
  return {
    message:
      error instanceof Error && !(error instanceof TypeError)
        ? error.message
        : "连接失败，请稍后重试。",
    error: true,
  };
}

export default function CapabilityCoachPanel({
  revision,
  onHabitCreated,
  onViewHabit,
}: {
  revision: number;
  onHabitCreated: (id: string) => Promise<void>;
  onViewHabit: (id: string) => void;
}) {
  const [overview, setOverview] = useState<CoachingOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [focus, setFocus] = useState<LogicSkill | null>(null);
  const [suggestion, setSuggestion] = useState<{
    version: number;
    plan: CoachingSuggestion;
  } | null>(null);
  const draftVersion = useRef(0);
  const [operation, setOperation] = useState<Operation | null>(null);
  const operationInFlight = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void requestCoaching<CoachingOverview>({ signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setOverview(data);
        setLoadError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [revision, reload]);

  const currentFocus = focus ?? overview?.recommendedFocus ?? "conditional";
  const focusEvidence = overview?.baseline.skills.find((item) => item.code === currentFocus);

  async function generate(useAI: boolean) {
    if (!overview?.canCoach || operationInFlight.current) return;
    operationInFlight.current = true;
    setOperation(useAI ? "ai" : "built_in");
    setNotice(null);
    try {
      const plan = await requestCoaching<CoachingSuggestion>({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus: currentFocus, consentToAI: useAI }),
      });
      setSuggestion({ version: ++draftVersion.current, plan });
      setNotice({
        message:
          useAI && plan.source === "built_in"
            ? "暂时未收到可用的 AI 方案，已加载内置方案。"
            : "训练方案已准备好，可以在下方调整并保存。",
      });
    } catch (error) {
      setNotice(errorNotice(error));
    } finally {
      operationInFlight.current = false;
      setOperation(null);
    }
  }

  async function save(habit: HabitDraft) {
    if (!suggestion || operationInFlight.current) return;
    operationInFlight.current = true;
    setOperation("save");
    setNotice(null);
    try {
      const { habit: created } = await requestCoaching<{ habit: { id: string; title: string } }>({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...habit, focus: suggestion.plan.draft.focus }),
      });
      setSuggestion(null);
      setNotice({ message: `「${created.title}」已关联逻辑推理初测与复测。` });
      setReload((value) => value + 1);
      try {
        await onHabitCreated(created.id);
      } catch {
        setNotice({ message: "训练习惯已保存，列表暂时无法刷新。", error: true });
      }
    } catch (error) {
      setNotice(errorNotice(error));
    } finally {
      operationInFlight.current = false;
      setOperation(null);
    }
  }

  return (
    <section
      id="capability-coach"
      className={`dashboard-panel ${styles.panel}`}
      aria-labelledby="capability-coach-title"
    >
      <h2 id="capability-coach-title">逻辑推理训练与复测</h2>
      <p className={styles.intro}>
        用初测选一个练习方向，把训练方案变成能执行的习惯，再用另一份短卷观察表现。
      </p>
      {overview && <RetestEvidence overview={overview} />}
      {!overview && !loadError && <p role="status">正在读取初测、训练和复测记录…</p>}
      {loadError && (
        <p role="status" className={styles.error}>
          训练记录暂时无法读取。
          <button
            type="button"
            className="text-button"
            onClick={() => setReload((value) => value + 1)}
          >
            重新读取
          </button>
        </p>
      )}
      {overview?.canCoach ? (
        <>
          <label className={styles.focus}>
            <span>本次训练方向</span>
            <select
              value={currentFocus}
              disabled={operation !== null}
              onChange={(event) => setFocus(event.target.value as LogicSkill)}
            >
              {logicSkills.map((code) => (
                <option value={code} key={code}>
                  {focusLabels[code]}
                  {overview.recommendedFocus === code ? "（初测建议）" : ""}
                </option>
              ))}
            </select>
          </label>
          {overview.aiConfigured && (
            <p id="coaching-ai-data" className={styles.sourceNote}>
              点击生成后，配置的 AI 服务商会收到所选方向及该方向的初测正确题数和总题数
              {focusEvidence?.correct != null
                ? `（${focusEvidence.correct} / ${focusEvidence.total} 道）`
                : ""}
              。
            </p>
          )}
          <div className={styles.actions}>
            {overview.aiConfigured && (
              <button
                type="button"
                className={styles.primary}
                aria-describedby="coaching-ai-data"
                disabled={operation !== null || loadError}
                onClick={() => void generate(true)}
              >
                {operation === "ai" ? "AI 正在拟定训练方案…" : "用 AI 生成训练方案"}
              </button>
            )}
            <button
              type="button"
              className={overview.aiConfigured ? "text-button" : styles.primary}
              disabled={operation !== null || loadError}
              onClick={() => void generate(false)}
            >
              {operation === "built_in" ? "正在读取内置方案…" : "使用内置训练方案"}
            </button>
          </div>
        </>
      ) : (
        overview && <p>完成可核验的 A 卷后，可以按答题表现生成训练方案。</p>
      )}
      {notice && (
        <p role="status" className={notice.error ? styles.error : styles.status}>
          {notice.message}
        </p>
      )}
      {suggestion && (
        <CoachingDraftForm
          key={suggestion.version}
          suggestion={suggestion.plan}
          focusLabel={focusLabels[suggestion.plan.draft.focus]}
          disabled={operation !== null || loadError || !overview?.canCoach}
          saving={operation === "save"}
          onSave={(habit) => void save(habit)}
        />
      )}
      {overview && (
        <LinkedTrainingHabits habits={overview.linkedHabits} onViewHabit={onViewHabit} />
      )}
      <div className={styles.actions}>
        <a href="/assess">{overview?.canCoach ? "打开独立初测与复测" : "打开逻辑推理初测"}</a>
        {overview?.canCoach && <a href="/practice">练习独立题库</a>}
        {overview?.canCoach && <a href="#habit-records">在已有习惯的成长进度中关联训练</a>}
      </div>
    </section>
  );
}
