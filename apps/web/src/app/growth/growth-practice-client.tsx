"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { growthPrompts, type GrowthPractice } from "@/lib/growth-practice";
import PracticeEditor, { type PracticeSelection } from "./growth-practice-editor";
import { growthPracticeErrorMessage, requestGrowthPractice } from "./growth-practice-api";
import styles from "./growth.module.css";

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "short",
  day: "numeric",
});
type PracticePage = { practices: GrowthPractice[]; nextOffset: number | null };

export default function GrowthPracticeClient() {
  const [items, setItems] = useState<GrowthPractice[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [selection, setSelection] = useState<PracticeSelection>({ kind: "new", key: 0 });
  const [dirty, setDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");
  const editor = useRef<HTMLElement | null>(null);
  const draftKey = useRef(0);
  const listRevision = useRef(0);

  async function load(offset = 0, signal?: AbortSignal) {
    const startedAt = listRevision.current;
    setLoading(true);
    setListError("");
    try {
      const page = await requestGrowthPractice<PracticePage>(
        `?offset=${offset}`,
        signal ? { signal } : undefined
      );
      if (signal?.aborted) return;
      if (listRevision.current !== startedAt) {
        await load(0, signal);
        return;
      }
      setItems((previous) =>
        offset === 0
          ? page.practices
          : [
              ...previous,
              ...page.practices.filter((row) => !previous.some((item) => item.id === row.id)),
            ]
      );
      setNextOffset(page.nextOffset);
    } catch (error) {
      if (signal?.aborted) return;
      if (listRevision.current !== startedAt) await load(0, signal);
      else setListError(growthPracticeErrorMessage(error));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(0, controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function mayLeave() {
    return !dirty || window.confirm("当前有未保存的内容。确定要离开吗？");
  }
  function open(next: PracticeSelection) {
    if (editorBusy || !mayLeave()) return;
    setDirty(false);
    setNotice("");
    setSelection(next);
    editor.current?.focus({ preventScroll: true });
    editor.current?.scrollIntoView({ block: "start" });
  }
  function newPractice(previous?: GrowthPractice) {
    draftKey.current += 1;
    open(
      previous
        ? {
            kind: "new",
            key: draftKey.current,
            dimension: previous.dimension,
            question: previous.nextQuestion,
          }
        : { kind: "new", key: draftKey.current }
    );
  }
  function saved(practice: GrowthPractice, message: string) {
    listRevision.current += 1;
    const alreadyListed = items.some((item) => item.id === practice.id);
    setItems((old) =>
      alreadyListed
        ? old.map((item) => (item.id === practice.id ? practice : item))
        : [practice, ...old]
    );
    if (!alreadyListed) setNextOffset((old) => (old === null ? null : old + 1));
    setSelection({ kind: "saved", practice });
    setDirty(false);
    setNotice(message);
    editor.current?.focus({ preventScroll: true });
  }
  async function remove(practice: GrowthPractice) {
    await requestGrowthPractice<{ ok: boolean }>(`/${practice.id}`, { method: "DELETE" });
    listRevision.current += 1;
    setItems((old) => old.filter((item) => item.id !== practice.id));
    setNextOffset((old) => (old === null ? null : Math.max(0, old - 1)));
    draftKey.current += 1;
    setSelection({ kind: "new", key: draftKey.current });
    setDirty(false);
    setNotice("实践已删除。");
  }
  const key =
    selection.kind === "new"
      ? "draft-" + selection.key
      : selection.practice.id + "-" + selection.practice.revision;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link
          href="/dashboard"
          className="wordmark"
          onClick={(event) => {
            if (!mayLeave()) event.preventDefault();
          }}
        >
          STEP<span>MARK</span>
          <span className="brand-dot">.</span>
        </Link>
        <nav className={styles.nav} aria-label="自主实践导航">
          <a href="#practice-history" className={styles.back}>
            我的实践
          </a>
          <Link
            href="/dashboard"
            className={styles.back}
            onClick={(event) => {
              if (!mayLeave()) event.preventDefault();
            }}
          >
            返回控制台
          </Link>
        </nav>
      </header>
      <section className={styles.hero} aria-labelledby="growth-title">
        <div className={styles.heroInner}>
          <h1 id="growth-title">自主实践</h1>
          <p>
            从一个你真正在意的问题出发。做一小步，用实际结果修正判断，再决定接下来学什么、做什么。
          </p>
          <ol className={styles.path}>
            <li>发现问题</li>
            <li>动手验证</li>
            <li>记录证据</li>
            <li>决定下一步</li>
          </ol>
        </div>
      </section>
      <div className={styles.workspace}>
        <section className={styles.main} ref={editor} tabIndex={-1} aria-label="实践记录编辑区">
          {notice && (
            <p className={styles.saved} role="status">
              {notice}
            </p>
          )}
          <PracticeEditor
            key={key}
            selection={selection}
            onDirty={setDirty}
            onBusy={setEditorBusy}
            onSaved={saved}
            onStartNext={newPractice}
            onDelete={remove}
          />
        </section>
        <aside
          id="practice-history"
          className={styles.history}
          aria-labelledby="practice-history-title"
        >
          <div className={styles.editorHeading}>
            <h2 id="practice-history-title">我的实践</h2>
            <button
              type="button"
              className={styles.quiet}
              disabled={editorBusy}
              onClick={() => newPractice()}
            >
              新建
            </button>
          </div>
          {loading && items.length === 0 && <p role="status">正在读取实践…</p>}
          {listError && <p role="status">{listError}</p>}
          {!loading && !listError && items.length === 0 && (
            <p>开始一次实践后，可以在这里接着记录或回看复盘。</p>
          )}
          <ul className={styles.entries}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={editorBusy}
                  aria-current={
                    selection.kind === "saved" && selection.practice.id === item.id
                      ? "true"
                      : undefined
                  }
                  onClick={() => open({ kind: "saved", practice: item })}
                >
                  <strong>{item.title}</strong>
                  <span>
                    {growthPrompts[item.dimension].label} · {item.completedAt ? "已复盘" : "进行中"}
                  </span>
                  <time dateTime={item.createdAt}>
                    {dateFormat.format(new Date(item.createdAt))}
                  </time>
                </button>
              </li>
            ))}
          </ul>
          {nextOffset !== null && (
            <button
              type="button"
              disabled={loading || editorBusy}
              className={styles.quiet}
              onClick={() => void load(nextOffset)}
            >
              {loading ? "读取中…" : "加载更多"}
            </button>
          )}
          <button
            type="button"
            disabled={loading || editorBusy}
            className={styles.quiet}
            onClick={() => void load()}
          >
            {listError ? "重试" : "刷新列表"}
          </button>
        </aside>
      </div>
    </main>
  );
}
