"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import AssistantChatPanel from "./assistant-chat-panel";
import CapabilityCoachPanel from "./capability-coach-panel";
import HabitGrowthPanel from "./habit-growth-panel";
import HabitInsightsPanel, { type HabitInsights } from "./habit-insights-panel";
import HabitOpportunityHistory, {
  opportunityFlags,
  type CorrectionHistory,
  type OpportunityCorrection,
  type OpportunityEvent,
  type OpportunityKind,
} from "./habit-opportunity-history";
import MeasurementEvidencePanel from "./measurement-evidence-panel";

type Habit = {
  id: string;
  title: string;
  cue: string | null;
  action: string;
  createdAt: string;
  _count: { events: number; checks: number };
};
type DueHabitReview = {
  habitId: string;
  title: string;
  progress: number;
  reviewReason: string;
};

export default function DashboardClient({ email }: { email: string }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [dueReviews, setDueReviews] = useState<DueHabitReview[]>([]);
  const [title, setTitle] = useState("");
  const [action, setAction] = useState("");
  const [cue, setCue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detailRevision, setDetailRevision] = useState(0);
  const [trainingRevision, setTrainingRevision] = useState(0);
  const [assessmentVisited, setAssessmentVisited] = useState(false);
  const assessmentPanel = useRef<HTMLDetailsElement>(null);
  const detailRequest = useRef(0);
  const [reflectionEventId, setReflectionEventId] = useState<string | null>(null);
  const [events, setEvents] = useState<OpportunityEvent[]>([]);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctionHistory, setCorrectionHistory] = useState<CorrectionHistory | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [insights, setInsights] = useState<HabitInsights | null>(null);

  const load = useCallback(async () => {
    const [result, reviewResult] = await Promise.all([
      fetch("/api/v1/habits", { cache: "no-store" }),
      fetch("/api/v1/habits/due", { cache: "no-store" }),
    ]);
    if (result.status === 401) {
      location.assign("/login");
      return;
    }
    if (!result.ok) throw new Error("LOAD_FAILED");
    const data = (await result.json()) as { habits: Habit[] };
    setHabits(data.habits);
    if (reviewResult.ok) {
      const reviews = (await reviewResult.json()) as { due: DueHabitReview[] };
      setDueReviews(reviews.due);
    }
  }, []);

  useEffect(() => {
    void load().catch(() => setMessage("读取失败，请检查数据库连接。"));
  }, [load]);

  const openAssessmentPanel = useCallback(() => {
    const panel = assessmentPanel.current;
    if (!panel) return;
    panel.open = true;
    setAssessmentVisited(true);
  }, []);

  useEffect(() => {
    function followAssessmentLink() {
      if (location.hash === "#assessment-records") openAssessmentPanel();
    }
    followAssessmentLink();
    window.addEventListener("hashchange", followAssessmentLink);
    return () => window.removeEventListener("hashchange", followAssessmentLink);
  }, [openAssessmentPanel]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/v1/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, action, cue: cue || undefined }),
      });
      if (!res.ok) throw new Error("CREATE_FAILED");
      setTitle("");
      setAction("");
      setCue("");
      await load();
      setMessage("习惯已添加。");
    } catch {
      setMessage("创建失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function recordOpportunity(habitId: string, kind: OpportunityKind) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    // A calendar-day opportunity is only a lightweight tracking convenience.
    // It is NOT a validated indicator of automaticity.
    const today = new Date().toLocaleDateString("en-CA");
    try {
      const res = await fetch("/api/v1/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          habitId,
          opportunityKey: `daily:${today}`,
          ...opportunityFlags[kind],
          occurredAt: new Date().toISOString(),
        }),
      });
      if (!res.ok && res.status !== 409) throw new Error("SAVE_FAILED");
      const parsed = res.ok ? ((await res.json()) as { event: { id: string } }) : null;
      await load();
      await detail(habitId, kind === "done" ? (parsed?.event.id ?? null) : null);
      const names = {
        done: "执行已保存，可以补记这次启动感受。",
        missed: "已记录有机会但未执行。",
        no_cue: "记录为今天没有出现触发情境，不计为执行失败。",
      };
      setMessage(res.status === 409 ? "本日已有不同状态的记录；如需纠错请查看记录。" : names[kind]);
    } catch {
      setMessage("记录失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function refreshEvents(id: string) {
    const response = await fetch("/api/v1/observations?habitId=" + encodeURIComponent(id), {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("EVENTS_FAILED");
    const body = (await response.json()) as { events: OpportunityEvent[] };
    setEvents(body.events);
  }

  async function showCorrectionHistory(eventId: string, offset = 0) {
    if (historyBusy) return;
    setHistoryBusy(true);
    try {
      const response = await fetch(
        "/api/v1/observations/" + encodeURIComponent(eventId) + "?offset=" + offset,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("HISTORY_FAILED");
      const body = (await response.json()) as {
        corrections: OpportunityCorrection[];
        nextOffset: number | null;
      };
      setCorrectionHistory((previous) => ({
        eventId,
        rows: offset === 0 ? body.corrections : [...(previous?.rows ?? []), ...body.corrections],
        nextOffset: body.nextOffset,
      }));
    } catch {
      setMessage("更正历史读取失败，请稍后重试。");
    } finally {
      setHistoryBusy(false);
    }
  }

  async function correctOpportunity(event: OpportunityEvent, kind: OpportunityKind) {
    if (!selected || correcting) return;
    const { eligible, completed } = opportunityFlags[kind];
    if (event.eligible === eligible && event.completed === completed) return;
    setCorrecting(event.id);
    try {
      const res = await fetch("/api/v1/observations/" + encodeURIComponent(event.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: event.revision, eligible, completed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
        const code = data?.error?.code;
        setMessage(
          code === "DELETE_LINKED_REFLECTION_FIRST"
            ? "这条执行记录关联了感受记录，请先在下方删除对应感受，再更正状态。"
            : code === "STALE_OPPORTUNITY_REVISION"
              ? "记录已在其他设备更改，已刷新列表，请重新选择。"
              : "更正失败，请刷新后重试。"
        );
        await refreshEvents(selected);
        return;
      }
      await Promise.all([refreshEvents(selected), load()]);
      await detail(selected);
      setMessage("更正已保存，可点击“更正历史”核对每次修改。");
    } catch {
      setMessage("网络错误，更正未确认。");
    } finally {
      setCorrecting(null);
    }
  }

  async function detail(id: string, eventId: string | null = null) {
    const request = ++detailRequest.current;
    try {
      const [insightResponse, eventResponse] = await Promise.all([
        fetch(`/api/v1/habits/${encodeURIComponent(id)}/insights`, { cache: "no-store" }),
        fetch("/api/v1/observations?habitId=" + encodeURIComponent(id), { cache: "no-store" }),
      ]);
      if (!insightResponse.ok || !eventResponse.ok) throw new Error();
      const [report, history] = await Promise.all([
        insightResponse.json() as Promise<HabitInsights>,
        eventResponse.json() as Promise<{ events: OpportunityEvent[] }>,
      ]);
      if (request !== detailRequest.current) return;
      setSelected(id);
      setReflectionEventId(eventId);
      setInsights(report);
      setEvents(history.events);
      setDetailRevision((value) => value + 1);
      setShowCorrections(false);
      setCorrectionHistory(null);
      requestAnimationFrame(() =>
        document.getElementById("habit-progress")?.scrollIntoView({ block: "start" })
      );
    } catch {
      if (request === detailRequest.current) setMessage("无法读取记录。");
    }
  }

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    location.assign("/login");
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <a className="wordmark" href="/">
          STEP<span>MARK</span>
          <span className="brand-dot">.</span>
        </a>
        <div>
          <span className="account-email">{email}</span>{" "}
          <a href="/settings" className="text-button">
            账户与数据
          </a>{" "}
          <button className="text-button" onClick={logout}>
            退出
          </button>
        </div>
      </header>
      <section className="dash-welcome">
        <h1>习惯与能力记录</h1>
        <p>和 AI 聊聊实际行动、思考过程与结果，查看习惯和成长证据。</p>
      </section>
      <div id="assistant-records">
        <AssistantChatPanel
          onChanged={async (id) => {
            await load();
            if (id) await detail(id);
          }}
        />
      </div>
      <nav className="dashboard-shortcuts" aria-label="记录与测评">
        <a href="#assistant-records">AI 对话</a>
        <a href="#habit-records">习惯进度</a>
        <a href="#assessment-records" onClick={openAssessmentPanel}>可选训练与复测</a>
      </nav>
      <details
        id="assessment-records"
        className="dashboard-panel"
        ref={assessmentPanel}
        onToggle={(event) => {
          if (event.currentTarget.open) setAssessmentVisited(true);
        }}
      >
        <summary>可选练习、初测与复测</summary>
        {assessmentVisited && (
          <>
            <CapabilityCoachPanel
              revision={detailRevision + trainingRevision}
              onHabitCreated={async (id) => {
                await load();
                await detail(id);
              }}
              onViewHabit={(id) => void detail(id)}
            />
            <MeasurementEvidencePanel />
          </>
        )}
      </details>
      <button
        type="button"
        className="assistant-advanced-toggle"
        onClick={() => setShowManual((x) => !x)}
        aria-expanded={showManual}
      >
        {showManual ? "收起手动管理" : "展开手动管理与详细记录"}
      </button>
      {dueReviews.length > 0 && (
        <section className="dashboard-panel due-review-panel">
          <h2>值得简短复查的习惯</h2>
          <p>只是应用内提示，不发送消息；也不会因为你没有填写感受而直接判定退步。</p>
          <div className="due-review-list">
            {dueReviews.slice(0, 4).map((review) => (
              <button type="button" key={review.habitId} onClick={() => detail(review.habitId)}>
                <span>{review.title}</span>
                <small>
                  {review.reviewReason === "recent_difficulty"
                    ? "最近启动更费力"
                    : review.reviewReason === "recent_misses"
                      ? "复查触发情境与行动难度"
                      : "看看现在是否仍然自然"}
                </small>
              </button>
            ))}
          </div>
        </section>
      )}
      <section
        id="habit-records"
        className={showManual ? "dashboard-grid" : "dashboard-grid dashboard-grid-single"}
      >
        {showManual && (
          <article className="dashboard-panel">
            <h2>手动建立习惯（备用入口）</h2>
            <form className="account-form" onSubmit={create}>
              <label htmlFor="habit-title">习惯名称</label>
              <input
                id="habit-title"
                maxLength={180}
                minLength={2}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：表达前先说结论"
              />
              <label htmlFor="habit-action">具体行动</label>
              <textarea
                id="habit-action"
                maxLength={500}
                minLength={2}
                required
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="例如：先用一句话概括结论，再解释原因"
              />
              <label htmlFor="habit-cue">触发情境（选填）</label>
              <input
                id="habit-cue"
                maxLength={250}
                value={cue}
                onChange={(e) => setCue(e.target.value)}
                placeholder="例如：当我要解释技术问题时"
              />
              <button disabled={busy}>添加习惯</button>
            </form>
          </article>
        )}
        <article className="dashboard-panel">
          <h2>已记录的习惯</h2>
          {habits.length === 0 ? (
            <p>还没有习惯，先创建一个可观察的行动。</p>
          ) : (
            <div className="habits-list">
              {habits.map((h) => (
                <div className="habit-row" key={h.id}>
                  <h3>{h.title}</h3>
                  <p>{h.action}</p>
                  {h.cue && <small>情境：{h.cue}</small>}
                  <div className="habit-actions habit-opportunity-actions">
                    <button disabled={busy} onClick={() => recordOpportunity(h.id, "done")}>
                      已执行
                    </button>
                    {showManual && (
                      <button
                        disabled={busy}
                        className="text-button"
                        onClick={() => recordOpportunity(h.id, "missed")}
                      >
                        有机会，没执行
                      </button>
                    )}
                    {showManual && (
                      <button
                        disabled={busy}
                        className="text-button"
                        onClick={() => recordOpportunity(h.id, "no_cue")}
                      >
                        今天没机会
                      </button>
                    )}
                    <button className="text-button" onClick={() => detail(h.id)}>
                      成长进度
                    </button>
                  </div>
                  <small>执行记录 {h._count.events} 条</small>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
      {selected && (
        <HabitGrowthPanel
          key={selected}
          habitId={selected}
          habitTitle={habits.find((habit) => habit.id === selected)?.title ?? "习惯"}
          eventId={reflectionEventId}
          revision={detailRevision}
          onEvidenceChanged={() => setTrainingRevision((value) => value + 1)}
        />
      )}
      {selected && insights && <HabitInsightsPanel insights={insights} />}
      {selected && (
        <HabitOpportunityHistory
          events={events}
          expanded={showCorrections}
          correcting={correcting}
          history={correctionHistory}
          historyBusy={historyBusy}
          onToggle={() => setShowCorrections((value) => !value)}
          onCorrect={correctOpportunity}
          onReadHistory={showCorrectionHistory}
          onCloseHistory={() => setCorrectionHistory(null)}
        />
      )}
      <p className="notice" role="status" aria-live="polite">
        {message}
      </p>
    </main>
  );
}
