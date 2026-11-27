import { el, status, textElement } from "./dom.js";

const habitStages = {
  collecting_evidence: "收集证据",
  developing: "形成中",
  maintaining: "维护观察",
  review_due: "建议复查",
  needs_fresh_evidence: "等待更新自评"
};

function habitDetails(invoke, habitId) {
  const details = document.createElement("details");
  details.className = "habit-detail";
  const body = document.createElement("div");
  body.setAttribute("role", "status");
  details.append(textElement("summary", "查看养成进度"), body);
  let loading = false;
  let loaded = false;
  details.addEventListener("toggle", async () => {
    if (!details.open || loading || loaded) return;
    loading = true;
    body.replaceChildren(textElement("p", "正在读取养成进度…"));
    try {
      const score = await invoke("get_habit_progress", { habitId });
      if (!Number.isFinite(score.progress)) {
        body.replaceChildren(textElement("p", "暂时无法读取。可收起后重试，或在网页查看记录。"));
        return;
      }
      const detailsRows = [
        textElement(
          "p",
          `${score.progress.toFixed(1)} / 100 · ${habitStages[score.stage] ?? "待更新"}`,
          "habit-score"
        ),
        textElement(
          "p",
          `累计完成 ${score.completedRepetitions} / ${score.eligibleOpportunities} 次 · 本人自评 ${score.evidenceCount} 天`
        )
      ];
      if (score.recentExecution) {
        const recent = score.recentExecution;
        detailsRows.push(
          textElement(
            "p",
            `近期完成 ${recent.completed} / ${recent.eligible} 次` +
              (recent.inconsistent ? " · 复查触发情境与行动难度" : "")
          )
        );
      }
      if (score.chatAutomaticity) {
        const { medianLow, medianHigh, days, stale } = score.chatAutomaticity;
        const level = medianLow === medianHigh ? medianLow : `${medianLow}–${medianHigh}`;
        detailsRows.push(
          textElement(
            "p",
            `聊天启动感受 ${level}/4 · ${days} 个执行日 · ${stale ? "历史证据" : "AI 暂定观察"}（非正式自评）`
          )
        );
      }
      body.replaceChildren(...detailsRows);
      loaded = true;
    } catch {
      body.replaceChildren(textElement("p", "暂时无法读取。可收起后重试，或在网页查看记录。"));
    } finally {
      loading = false;
    }
  });
  return details;
}

export function initializeAccountPanel(invoke) {
  let accountBusy = false;
  let signedIn = false;

  function setAccountBusy(value) {
    accountBusy = value;
    for (const id of ["login", "habit-login", "logout", "refresh"])
      el(id).disabled = value || !invoke;
  }

  function showAccount(connected, email) {
    signedIn = connected;
    el("login").hidden = connected;
    el("habit-login").hidden = connected;
    el("refresh").hidden = !connected;
    el("open-assessments").hidden = !connected;
    el("logout").hidden = !connected;
    el("account-name").textContent = connected
      ? email || "已连接 StepMark 账号"
      : "未连接。连接账号后可查看习惯记录。";
    if (!connected) {
      el("habit-list").replaceChildren();
      el("list-hint").textContent = "连接 StepMark 账号后查看已记录的习惯。";
    }
  }

  async function readHabits() {
    const data = await invoke("get_habits");
    const habits = data.habits;
    el("list-hint").textContent = habits.length
      ? "当前未归档习惯（最多显示 50 项）"
      : "当前没有未归档习惯。";
    const cards = habits.map((habit) => {
      const card = document.createElement("article");
      card.className = "habit-card";
      card.append(textElement("h3", habit.title ?? "未命名习惯"));
      if (habit.action) card.append(textElement("p", habit.action));
      if (habit.cue) card.append(textElement("p", "触发情境：" + habit.cue));
      card.append(
        textElement("small", "执行记录 " + (habit._count?.events ?? 0) + " 条"),
        habitDetails(invoke, habit.id)
      );
      return card;
    });
    el("habit-list").replaceChildren(...cards);
  }

  async function accountAction(command) {
    if (accountBusy) return;
    setAccountBusy(true);
    const pending = command === "sign_in" ? "请在系统浏览器完成登录和授权。" : "正在同步账号…";
    status("account-status", pending);
    status("habit-status", pending);
    try {
      const result = await invoke(command);
      if (command === "sign_out") {
        showAccount(false);
        status(
          "account-status",
          result.serverRevoked ? "已注销。" : "本机已注销，服务器撤销未确认。",
          !result.serverRevoked
        );
      } else {
        showAccount(true, result?.user?.email);
        await readHabits();
        status("account-status", "");
      }
      status("habit-status", "");
    } catch (error) {
      const current = await invoke("get_status").catch(() => null);
      if (current && !current.signedIn) showAccount(false);
      status("account-status", String(error), true);
      status("habit-status", String(error), true);
    } finally {
      setAccountBusy(false);
    }
  }

  async function initializeAccount() {
    setAccountBusy(true);
    try {
      const current = await invoke("get_status");
      el("api-label").textContent =
        current.apiOrigin === "http://127.0.0.1:8080"
          ? "本机 · " + current.apiOrigin
          : current.apiOrigin;
      if (current.signedIn) {
        const me = await invoke("get_me");
        showAccount(true, me?.user?.email);
        await readHabits();
      } else showAccount(false);
    } catch (error) {
      status("account-status", String(error), true);
      status("habit-status", String(error), true);
    } finally {
      setAccountBusy(false);
    }
  }

  el("login").addEventListener("click", () => void accountAction("sign_in"));
  el("habit-login").addEventListener("click", () => void accountAction("sign_in"));
  el("logout").addEventListener("click", () => void accountAction("sign_out"));
  el("refresh").addEventListener("click", () => {
    if (signedIn) void accountAction("get_me");
  });
  el("open-assessments").addEventListener("click", () => {
    if (invoke)
      void invoke("open_assessments").catch((error) => status("habit-status", String(error), true));
  });
  setAccountBusy(false);
  if (invoke) void initializeAccount();
}
