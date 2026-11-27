export type OpportunityCorrection = {
  id: string;
  revision: number;
  previousEligible: boolean;
  previousCompleted: boolean;
  updatedEligible: boolean;
  updatedCompleted: boolean;
  source: string;
  correctedAt: string;
};
export type OpportunityEvent = {
  id: string;
  opportunityKey: string;
  eligible: boolean;
  completed: boolean;
  occurredAt: string;
  revision: number;
};
export const opportunityFlags = {
  done: { eligible: true, completed: true },
  missed: { eligible: true, completed: false },
  no_cue: { eligible: false, completed: false },
} as const;
export type OpportunityKind = keyof typeof opportunityFlags;
export type CorrectionHistory = {
  eventId: string;
  rows: OpportunityCorrection[];
  nextOffset: number | null;
};

const correctionChoices = [
  ["done", "改为已执行"],
  ["missed", "改为未执行"],
  ["no_cue", "改为无机会"],
] as const;

type OpportunityHistoryProps = {
  events: OpportunityEvent[];
  expanded: boolean;
  correcting: string | null;
  history: CorrectionHistory | null;
  historyBusy: boolean;
  onToggle: () => void;
  onCorrect: (event: OpportunityEvent, kind: OpportunityKind) => void;
  onReadHistory: (eventId: string, offset?: number) => void;
  onCloseHistory: () => void;
};

function stateLabel(eligible: boolean, completed: boolean) {
  return !eligible ? "没有触发机会" : completed ? "已执行" : "有机会但未执行";
}

export default function HabitOpportunityHistory({
  events,
  expanded,
  correcting,
  history,
  historyBusy,
  onToggle,
  onCorrect,
  onReadHistory,
  onCloseHistory,
}: OpportunityHistoryProps) {
  const nextOffset = history?.nextOffset ?? null;
  return (
    <>
      <button
        type="button"
        className="assistant-advanced-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {expanded ? "收起历史更正工具" : "查看或更正最近执行记录"}
      </button>
      {expanded && (
        <section className="dashboard-panel">
          <h2>最近记录 · 更正状态</h2>
          <p>
            误选“已执行 / 没执行 /
            没机会”时，可在这里更正。每次更正会保留审计历史，不会重复增加次数。
          </p>
          {events.length === 0 ? (
            <p>暂无记录。</p>
          ) : (
            events.slice(0, 14).map((event) => (
              <div className="habit-row" key={event.id}>
                <p>
                  {new Date(event.occurredAt).toLocaleDateString("zh-CN")} · 当前：
                  {stateLabel(event.eligible, event.completed)} · 版本 {event.revision}
                </p>
                <div className="habit-actions">
                  {correctionChoices.map(([kind, label]) => {
                    const { eligible, completed } = opportunityFlags[kind];
                    return (
                      <button
                        key={kind}
                        type="button"
                        disabled={
                          correcting !== null ||
                          (event.eligible === eligible && event.completed === completed)
                        }
                        className="text-button"
                        onClick={() => onCorrect(event, kind)}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {event.revision > 0 && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={historyBusy}
                      onClick={() => {
                        if (history?.eventId === event.id) onCloseHistory();
                        else onReadHistory(event.id);
                      }}
                    >
                      {history?.eventId === event.id ? "收起更正历史" : "查看更正历史"}
                    </button>
                  )}
                </div>
                {history?.eventId === event.id && (
                  <div className="growth-history" aria-live="polite">
                    <h3>这条记录的修改过程</h3>
                    {history.rows.map((entry) => (
                      <p key={entry.id}>
                        版本 {entry.revision} ·{" "}
                        {new Date(entry.correctedAt).toLocaleString("zh-CN")} ·
                        {stateLabel(entry.previousEligible, entry.previousCompleted)} →{" "}
                        {stateLabel(entry.updatedEligible, entry.updatedCompleted)}
                      </p>
                    ))}
                    {nextOffset !== null && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={historyBusy}
                        onClick={() => onReadHistory(event.id, nextOffset)}
                      >
                        {historyBusy ? "读取中…" : "加载更多历史"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      )}
    </>
  );
}
