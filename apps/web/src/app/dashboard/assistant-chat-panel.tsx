"use client";

import { useEffect, useState, type FormEvent } from "react";
import { aiErrorMessage } from "@/lib/ai-errors";
import WorkEvidencePanel from "./work-evidence-panel";

const assistantEndpoint = "/api/v1/assistant";
const availabilityLabels = {
  checking: "正在检查 AI 配置",
  ready: "AI 服务已配置",
  unconfigured: "AI 服务未配置",
  unavailable: "暂时无法读取 AI 配置"
};
type Availability = keyof typeof availabilityLabels;

type Reply = {
  reply: string;
  change: { kind: string; habitId: string; habitTitle: string } | null;
  progress: { habitId: string; percent: number; repetitions: number; evidenceStale: boolean } | null;
  workEvidenceAdded?: number;
};
type Bubble = { id: string; role: "assistant" | "user"; text: string };
type ChatPreferences = { consent: boolean; recordEvidence: boolean };
const defaultPreferences: ChatPreferences = { consent: false, recordEvidence: true };

function preferencesStorageKey(userId: string) {
  return `stepmark:assistant-preferences:v1:${userId}`;
}

function readPreferences(userId: string): ChatPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(preferencesStorageKey(userId)) ?? "null") as
      | Partial<ChatPreferences>
      | null;
    return { consent: stored?.consent === true, recordEvidence: stored?.recordEvidence !== false };
  } catch {
    return defaultPreferences;
  }
}

function localDay() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function rateLimitMessage(response: Response) {
  const raw = response.headers.get("Retry-After") ?? "";
  const seconds = /^[0-9]{1,5}$/.test(raw) ? Number(raw) : 0;
  return seconds >= 1 && seconds <= 86400
    ? `请求已达到限制，请在约 ${Math.ceil(seconds / 60)} 分钟后重试。`
    : "请求已达到限制，请稍后再试。";
}

export default function AssistantChatPanel({
  onChanged
}: {
  onChanged: (habitId: string | null) => Promise<void>;
}) {
  const [messages, setMessages] = useState<Bubble[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "说说你做了什么、怎么做的、最后怎么样了。你也可以聊习惯或问我下一步怎么验证。"
    }
  ]);
  const [draft, setDraft] = useState("");
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [consentUser, setConsentUser] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>("checking");
  const [statusCheck, setStatusCheck] = useState(0);
  const [evidenceRevision, setEvidenceRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState<{ message: string; requestId: string } | null>(null);
  const { consent, recordEvidence } = preferences;

  useEffect(() => {
    const controller = new AbortController();
    async function loadAvailability() {
      try {
        const response = await fetch(assistantEndpoint, {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Assistant status request failed");
        const data = (await response.json()) as { configured?: unknown; userId?: unknown };
        if (typeof data.configured !== "boolean" || typeof data.userId !== "string" || !data.userId) {
          throw new Error("Assistant status response was invalid");
        }
        if (controller.signal.aborted) return;
        setConsentUser(data.userId);
        setPreferences(readPreferences(data.userId));
        setAvailability(data.configured ? "ready" : "unconfigured");
      } catch {
        if (!controller.signal.aborted) setAvailability("unavailable");
      }
    }
    void loadAvailability();
    return () => controller.abort();
  }, [statusCheck]);

  useEffect(() => {
    const userId = consentUser;
    if (!userId) return;
    const key = preferencesStorageKey(userId);
    const syncPreferences = (event: StorageEvent) => {
      if (event.key === key || event.key === null) setPreferences(readPreferences(userId));
    };
    window.addEventListener("storage", syncPreferences);
    return () => window.removeEventListener("storage", syncPreferences);
  }, [consentUser]);

  function checkAvailability() {
    setAvailability("checking");
    setNotice("");
    setStatusCheck((value) => value + 1);
  }

  function changePreferences(next: ChatPreferences) {
    if (!consentUser) return;
    setPreferences(next);
    setNotice("");
    try {
      localStorage.setItem(preferencesStorageKey(consentUser), JSON.stringify(next));
    } catch {
      setNotice("浏览器未能保存授权更改。当前页面已更新，重新进入时请确认开关状态。");
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (busy || message.length < 2 || availability !== "ready" || !consent || !consentUser) return;

    const sameRetry = retry?.message === message;
    const requestId = sameRetry ? retry.requestId : crypto.randomUUID();
    setRetry({ message, requestId });
    setBusy(true);
    setNotice("");
    setDraft("");
    if (!sameRetry) {
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "user" as const, text: message }
      ].slice(-16));
    }

    try {
      const response = await fetch(assistantEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          requestId,
          localDate: localDay(),
          consentToAI: true,
          consentUserId: consentUser,
          recordGrowthEvidence: recordEvidence
        })
      });
      const data = (await response.json().catch(() => null)) as
        | (Reply & { error?: { code: string } })
        | null;
      if (!response.ok) {
        const code = data?.error?.code;
        if (code === "ASSISTANT_NOT_CONFIGURED") {
          setAvailability("unconfigured");
          throw new Error("服务器暂未配置对话 AI，可以使用手动管理。");
        }
        if (code === "ASSISTANT_CONSENT_ACCOUNT_CHANGED") {
          setConsentUser(null);
          setPreferences(defaultPreferences);
          setRetry(null);
          checkAvailability();
          throw new Error("登录账户已切换。请确认当前账户与授权后再发送。");
        }
        if (code === "RATE_LIMITED") throw new Error(rateLimitMessage(response));
        throw new Error(
          aiErrorMessage(code) ?? "本次请求未确认保存，请检查记录后重试，避免重复登记。"
        );
      }
      if (!data || typeof data.reply !== "string") {
        throw new Error("AI 返回的数据无效，请稍后重试。");
      }
      setRetry(null);
      const reply = data.workEvidenceAdded
        ? `${data.reply}\n已更新 ${data.workEvidenceAdded} 条成长证据。`
        : data.reply;
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: "assistant" as const, text: reply }
      ].slice(-16));
      if (data.workEvidenceAdded) setEvidenceRevision((value) => value + 1);
      if (data.change || data.progress) {
        try {
          await onChanged(data.change?.habitId ?? data.progress?.habitId ?? null);
        } catch {
          setNotice("记录已成功处理，但页面统计暂时刷新失败；请重新进入成长进度查看。");
        }
      }
    } catch (error) {
      setDraft(message);
      setNotice(error instanceof Error ? error.message : "网络错误，请检查连接。");
    } finally {
      setBusy(false);
    }
  }

  const canSend = availability === "ready" && consent && !busy && draft.trim().length >= 2;
  return (
    <section className="dashboard-panel assistant-chat" aria-label="StepMark AI 对话">
      <div className="assistant-chat-heading">
        <div>
          <h2>AI 成长助手</h2>
          <p>用对话记录行动、整理成长证据或讨论下一步。</p>
        </div>
        <span className="assistant-chat-tag" role="status">
          {availabilityLabels[availability]}
        </span>
      </div>
      <div className="assistant-messages" role="log" aria-live="polite" aria-label="对话消息">
        {messages.map((item) => (
          <p
            className={"assistant-bubble " + (item.role === "user" ? "assistant-bubble-user" : "")}
            key={item.id}
          >
            {item.text}
          </p>
        ))}
      </div>
      <form onSubmit={send} className="assistant-send-form">
        <label htmlFor="assistant-message">向 AI 描述你的行动或提问</label>
        <div className="assistant-compose">
          <textarea
            id="assistant-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={600}
            rows={2}
            placeholder="说说你做了什么，或有什么实际结果…"
          />
          <button type="submit" disabled={!canSend}>
            {busy ? "处理中…" : "发送"}
          </button>
        </div>
        <label className="assistant-consent">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy || !consentUser}
            onChange={(event) => changePreferences({ ...preferences, consent: event.target.checked })}
          />
          <span>
            允许向服务器配置的第三方 AI 服务商发送我主动提交的消息及相关习惯名称。本浏览器记住此账户的授权，可随时关闭。
          </span>
        </label>
        {consent && (
          <label className="assistant-consent">
            <input
              type="checkbox"
              checked={recordEvidence}
              disabled={busy}
              onChange={(event) =>
                changePreferences({ ...preferences, recordEvidence: event.target.checked })
              }
            />
            <span>从我报告的行动自动保存成长证据（仅保留相关原话）。</span>
          </label>
        )}
        {(availability === "unconfigured" || availability === "unavailable") && (
          <p className="assistant-chat-help">
            可以继续使用手动管理。{" "}
            <button type="button" className="text-button" onClick={checkAvailability}>
              重新检查 AI 配置
            </button>
          </p>
        )}
        {notice && <p className="assistant-error" role="status">{notice}</p>}
      </form>
      <WorkEvidencePanel revision={evidenceRevision} />
    </section>
  );
}
