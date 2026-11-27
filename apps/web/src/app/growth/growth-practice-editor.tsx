import { useRef, useState, type FormEvent } from "react";
import {
  growthDimensions,
  growthLimits,
  growthPrompts,
  hasGrowthReview,
  type GrowthDimension,
  type GrowthPlan,
  type GrowthPractice,
  type GrowthReview,
  type GrowthReviewDraft,
} from "@/lib/growth-practice";
import { growthPracticeErrorMessage, requestGrowthPractice } from "./growth-practice-api";
import styles from "./growth.module.css";

const jsonHeaders = { "Content-Type": "application/json" };
const emptyPlan: GrowthPlan = {
  dimension: "thinking",
  title: "",
  question: "",
  nextAction: "",
  successCriteria: "",
};
const emptyReview: GrowthReview = { evidence: "", reflection: "", nextQuestion: "" };

export type PracticeSelection =
  | { kind: "new"; key: number; dimension?: GrowthDimension; question?: string }
  | { kind: "saved"; practice: GrowthPractice };

export default function PracticeEditor({
  selection,
  onDirty,
  onBusy,
  onSaved,
  onStartNext,
  onDelete,
}: {
  selection: PracticeSelection;
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
  onSaved: (practice: GrowthPractice, message: string) => void;
  onStartNext: (practice: GrowthPractice) => void;
  onDelete: (practice: GrowthPractice) => Promise<void>;
}) {
  const practice = selection.kind === "saved" ? selection.practice : null;
  const initialPlan =
    selection.kind === "new"
      ? {
          ...emptyPlan,
          dimension: selection.dimension ?? emptyPlan.dimension,
          question: selection.question ?? emptyPlan.question,
        }
      : {
          dimension: selection.practice.dimension,
          title: selection.practice.title,
          question: selection.practice.question,
          nextAction: selection.practice.nextAction,
          successCriteria: selection.practice.successCriteria,
        };
  const [plan, setPlan] = useState<GrowthPlan>(initialPlan);
  const [review, setReview] = useState<GrowthReview>(
    practice
      ? {
          evidence: practice.evidence,
          reflection: practice.reflection,
          nextQuestion: practice.nextQuestion,
        }
      : emptyReview
  );
  const [showPlan, setShowPlan] = useState(false);
  const [showReview, setShowReview] = useState(
    Boolean(practice?.reflection || practice?.nextQuestion)
  );
  const [aiReview, setAiReview] = useState(false);
  const [busy, setBusy] = useState<"save" | "plan" | "review" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const creationAttempt = useRef<{ body: string; requestId: string } | null>(null);
  const prompt = growthPrompts[plan.dimension];
  const canSave = [plan.question, plan.nextAction, plan.successCriteria].every(
    (value) => value.trim().length >= 2
  );
  const complete = Boolean(practice?.completedAt);

  function setOperation(operation: typeof busy) {
    setBusy(operation);
    onBusy(operation !== null);
  }

  function changePlan<K extends keyof GrowthPlan>(key: K, value: GrowthPlan[K]) {
    setPlan((old) => ({ ...old, [key]: value }));
    onDirty(true);
  }

  function changeReview(key: keyof GrowthReview, value: string) {
    if (key === "evidence" && aiReview) setReview({ ...emptyReview, evidence: value });
    else setReview((old) => ({ ...old, [key]: value }));
    if (aiReview && key !== "nextQuestion") setAiReview(false);
    setMessage("");
    onDirty(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || complete) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const finish = submitter instanceof HTMLButtonElement && submitter.value === "complete";
    if (!canSave) return;
    if (finish && !hasGrowthReview(review)) {
      setMessage("请先写下实际观察到的结果，以及这次实践改变了什么判断。");
      return;
    }
    setOperation("save");
    setMessage("");
    try {
      let data: object;
      if (practice) {
        data = { ...plan, ...review, revision: practice.revision, complete: finish };
      } else {
        const body = JSON.stringify(plan);
        if (creationAttempt.current?.body !== body)
          creationAttempt.current = { body, requestId: crypto.randomUUID() };
        data = { ...plan, requestId: creationAttempt.current.requestId };
      }
      const result = await requestGrowthPractice<{ practice: GrowthPractice }>(
        practice ? `/${practice.id}` : "",
        { method: practice ? "PUT" : "POST", headers: jsonHeaders, body: JSON.stringify(data) }
      );
      onSaved(
        result.practice,
        finish ? "已完成复盘。" : practice ? "实践已保存。" : "已开始实践。行动后回来记录实证。"
      );
    } catch (error) {
      setMessage(growthPracticeErrorMessage(error));
    } finally {
      setOperation(null);
    }
  }
  async function generateDraft(mode: "plan" | "review") {
    if (busy || plan.question.trim().length < 2) return;
    if (mode === "review" && (!canSave || review.evidence.trim().length < 2)) return;
    setOperation(mode);
    setMessage("");
    try {
      const { question, nextAction, successCriteria } = plan;
      const payload =
        mode === "plan"
          ? { mode, question }
          : { mode, question, nextAction, successCriteria, evidence: review.evidence };
      const request: RequestInit = {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ ...payload, consentToAI: true }),
      };
      if (mode === "plan") {
        const { draft } = await requestGrowthPractice<{ draft: Omit<GrowthPlan, "question"> }>(
          "/feedback",
          request
        );
        setPlan({ ...draft, question });
        setShowPlan(true);
        setMessage("计划已拟好。可以直接开始或先调整。");
      } else {
        const { draft } = await requestGrowthPractice<{ draft: GrowthReviewDraft }>(
          "/feedback",
          request
        );
        setReview((old) => ({ ...old, ...draft }));
        setAiReview(true);
        setShowReview(true);
        setMessage("复盘已拟好。确认判断和下一问后即可保存。");
      }
      onDirty(true);
    } catch (error) {
      setMessage(growthPracticeErrorMessage(error));
    } finally {
      setOperation(null);
    }
  }
  async function deletePractice() {
    if (!practice || busy) return;
    setOperation("delete");
    setMessage("");
    try {
      await onDelete(practice);
    } catch (error) {
      setMessage(growthPracticeErrorMessage(error));
    } finally {
      setOperation(null);
    }
  }

  return (
    <article className={styles.editor} aria-labelledby="practice-editor-title">
      <div className={styles.editorHeading}>
        <h2 id="practice-editor-title">
          {practice ? (complete ? practice.title : "继续实践") : "开启一次实践"}
        </h2>
        {practice && <span className={styles.state}>{complete ? "已复盘" : "进行中"}</span>}
      </div>
      {complete && practice ? (
        <dl className={styles.readback}>
          <div>
            <dt>实践方向</dt>
            <dd>{growthPrompts[practice.dimension].label}</dd>
          </div>
          <div>
            <dt>起初的问题</dt>
            <dd>{practice.question}</dd>
          </div>
          <div>
            <dt>行动与验收</dt>
            <dd>{practice.nextAction}</dd>
            <dd>{practice.successCriteria}</dd>
          </div>
          <div>
            <dt>实际观察</dt>
            <dd>{practice.evidence}</dd>
          </div>
          <div>
            <dt>判断如何改变</dt>
            <dd>{practice.reflection}</dd>
          </div>
          {practice.nextQuestion && (
            <div>
              <dt>下一个问题</dt>
              <dd>{practice.nextQuestion}</dd>
            </div>
          )}
        </dl>
      ) : (
        <form className={styles.form} onSubmit={save}>
          {(!practice || showPlan) && (
            <fieldset className={styles.fields} disabled={busy !== null}>
              <label className={styles.wide}>
                我想弄明白的问题
                <textarea
                  required
                  minLength={2}
                  maxLength={growthLimits.question}
                  rows={2}
                  value={plan.question}
                  onChange={(event) => changePlan("question", event.target.value)}
                  placeholder={prompt.question}
                />
              </label>
              {showPlan && (
                <>
                  <label>
                    我想练什么
                    <select
                      value={plan.dimension}
                      onChange={(event) =>
                        changePlan("dimension", event.target.value as GrowthDimension)
                      }
                    >
                      {growthDimensions.map((dimension) => (
                        <option key={dimension} value={dimension}>
                          {growthPrompts[dimension].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    实践名称<span className={styles.optional}>选填</span>
                    <input
                      maxLength={growthLimits.title}
                      value={plan.title}
                      onChange={(event) => changePlan("title", event.target.value)}
                      placeholder="留空时使用问题的第一行"
                    />
                  </label>
                  <label>
                    能先做哪一小步？
                    <textarea
                      required
                      minLength={2}
                      maxLength={growthLimits.nextAction}
                      rows={3}
                      value={plan.nextAction}
                      onChange={(event) => changePlan("nextAction", event.target.value)}
                      placeholder={prompt.action}
                    />
                  </label>
                  <label>
                    我准备怎样验证？
                    <textarea
                      required
                      minLength={2}
                      maxLength={growthLimits.successCriteria}
                      rows={3}
                      value={plan.successCriteria}
                      onChange={(event) => changePlan("successCriteria", event.target.value)}
                      placeholder={prompt.criterion}
                    />
                  </label>
                </>
              )}
            </fieldset>
          )}
          {!practice && (
            <div className={styles.ai}>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={canSave ? styles.secondary : styles.primary}
                  disabled={busy !== null || plan.question.trim().length < 2}
                  onClick={() => void generateDraft("plan")}
                >
                  {busy === "plan"
                    ? "正在拟计划…"
                    : canSave
                      ? "让 AI 重新拟计划"
                      : "让 AI 制定计划"}
                </button>
                {!showPlan && (
                  <button
                    type="button"
                    className={styles.quiet}
                    disabled={busy !== null}
                    onClick={() => setShowPlan(true)}
                  >
                    手动填写
                  </button>
                )}
              </div>
              <p>点击后，本次问题将发送给 DeepSeek。</p>
            </div>
          )}
          {practice && !showPlan && (
            <div>
              <dl className={styles.readback}>
                <div>
                  <dt>这次的问题</dt>
                  <dd>{plan.question}</dd>
                </div>
                <div>
                  <dt>下一步行动</dt>
                  <dd>{plan.nextAction}</dd>
                </div>
                <div>
                  <dt>怎样验证</dt>
                  <dd>{plan.successCriteria}</dd>
                </div>
              </dl>
              <button
                type="button"
                className={styles.quiet}
                disabled={busy !== null}
                onClick={() => setShowPlan(true)}
              >
                编辑计划
              </button>
            </div>
          )}
          {practice && (
            <fieldset className={styles.fields} disabled={busy !== null}>
              <legend>行动后的复盘</legend>
              <label className={styles.wide}>
                实际发生了什么？
                <textarea
                  maxLength={growthLimits.evidence}
                  rows={3}
                  value={review.evidence}
                  onChange={(event) => changeReview("evidence", event.target.value)}
                  placeholder="写下能核对的结果，例如一次测试、一段作品、他人的反馈或现场观察。"
                />
              </label>
              {showReview && (
                <>
                  <label>
                    这次的观察支持什么判断？
                    <textarea
                      maxLength={growthLimits.reflection}
                      rows={3}
                      value={review.reflection}
                      onChange={(event) => changeReview("reflection", event.target.value)}
                      placeholder="哪些结果符合预期？哪些相反？你打算保留或修正哪个判断？"
                    />
                  </label>
                  <label>
                    接下来还想弄明白什么？<span className={styles.optional}>选填</span>
                    <textarea
                      maxLength={growthLimits.nextQuestion}
                      rows={3}
                      value={review.nextQuestion}
                      onChange={(event) => changeReview("nextQuestion", event.target.value)}
                      placeholder="可以留下一个问题作为下一次实践的起点。"
                    />
                  </label>
                </>
              )}
            </fieldset>
          )}
          {practice && (
            <div className={styles.ai}>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={showReview ? styles.secondary : styles.primary}
                  disabled={busy !== null || !canSave || review.evidence.trim().length < 2}
                  onClick={() => void generateDraft("review")}
                >
                  {busy === "review" ? "正在整理复盘…" : "让 AI 整理复盘"}
                </button>
                {!showReview && (
                  <button
                    type="button"
                    className={styles.quiet}
                    disabled={busy !== null}
                    onClick={() => setShowReview(true)}
                  >
                    手动复盘
                  </button>
                )}
              </div>
              <p>点击后，本次问题、行动、验证标准和实际观察将发送给 DeepSeek。</p>
            </div>
          )}
          <div className={styles.actions}>
            {practice && showReview && (
              <button
                type="submit"
                className={styles.primary}
                disabled={busy !== null || !canSave || !hasGrowthReview(review)}
                value="complete"
              >
                {busy === "save" ? "正在保存…" : "确认并完成复盘"}
              </button>
            )}
            {(practice || showPlan) && (
              <button
                type="submit"
                className={practice ? styles.secondary : styles.primary}
                disabled={busy !== null || !canSave}
                value="save"
              >
                {busy === "save" ? "正在保存…" : practice ? "保存进展" : "确认并开始实践"}
              </button>
            )}
          </div>
        </form>
      )}
      {complete && practice && (
        <button type="button" className={styles.primary} onClick={() => onStartNext(practice)}>
          {practice.nextQuestion ? "用下一个问题开启实践" : "开启下一次实践"}
        </button>
      )}
      {practice && (
        <div className={styles.deleteRow}>
          {confirmDelete ? (
            <>
              <span>删除后无法恢复这次实践。</span>
              <button
                type="button"
                className={styles.danger}
                disabled={busy !== null}
                onClick={deletePractice}
              >
                确认删除
              </button>
              <button
                type="button"
                className={styles.quiet}
                disabled={busy !== null}
                onClick={() => setConfirmDelete(false)}
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.quiet}
              disabled={busy !== null}
              onClick={() => setConfirmDelete(true)}
            >
              删除记录
            </button>
          )}
        </div>
      )}
      <p className={styles.message} role="status">
        {message}
      </p>
    </article>
  );
}
