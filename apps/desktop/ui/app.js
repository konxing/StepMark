import { initializeAccountPanel } from "./account.js";
import { el, status, textElement } from "./dom.js";

const invoke = window.__TAURI__?.core?.invoke;
const navigation = [...document.querySelectorAll("[data-view]")];
const starters = [...document.querySelectorAll("[data-starter]")];
const conversation = [];
const contextTurns = 6;
const provider = { configured: false, savedHere: false, verified: false };
let providerBusy = false;
let workBusy = false;
let starterPrompt = "";

function showView(view, focus = false) {
  if (view !== "connections") el("api-key").value = "";
  for (const button of navigation) {
    const selected = button.dataset.view === view;
    el("view-" + button.dataset.view).hidden = !selected;
    if (selected) {
      button.setAttribute("aria-current", "page");
      if (focus) button.focus();
    } else button.removeAttribute("aria-current");
  }
}

function syncWorkspace() {
  const started = conversation.length > 0;
  el("conversation").hidden = !started;
  el("welcome").hidden = started;
  el("new-problem").hidden = !started;
  el("new-problem").disabled = workBusy;
  el("question").disabled = workBusy;
  el("question").placeholder = started
    ? "补充事实、反馈结果，或让 AI 继续完善成果。"
    : starterPrompt || "说说你希望解决什么，或希望得到什么成果。";
  el("composer-label").textContent = started ? "继续这件事" : "你的问题";
  el("send").textContent = workBusy ? "正在处理…" : started ? "继续" : "交给 AI";
  el("send").disabled = !provider.configured || workBusy || providerBusy;
  for (const starter of starters) starter.disabled = workBusy;
}

function syncProvider() {
  const { configured, savedHere, verified } = provider;
  el("connection-indicator").classList.toggle("ready", verified);
  el("connection-status").textContent = verified
    ? "DeepSeek 连接正常"
    : configured
      ? "DeepSeek 已配置"
      : "DeepSeek 未连接";
  el("ai-unavailable").hidden = configured;
  el("provider-label").textContent = configured
    ? savedHere
      ? "Windows 凭据管理器"
      : "环境变量"
    : "未配置";
  el("test-key").hidden = !configured;
  el("clear-key").hidden = !savedHere;
  for (const id of ["api-key", "save-key", "test-key", "clear-key"])
    el(id).disabled = providerBusy || workBusy || !invoke;
  syncWorkspace();
}

async function readProvider() {
  const result = await invoke("deepseek_status");
  provider.configured = result.configured;
  provider.savedHere = result.savedHere;
  if (!provider.configured) provider.verified = false;
  syncProvider();
}

async function changeProvider(command, args, pending, done) {
  if (providerBusy || workBusy) return;
  providerBusy = true;
  syncProvider();
  status("key-status", pending);
  try {
    await invoke(command, args);
    if (command === "save_deepseek_key") el("api-key").value = "";
    provider.verified = command !== "clear_deepseek_key";
    await readProvider();
    status("key-status", done);
  } catch (error) {
    if (command === "check_deepseek") provider.verified = false;
    status("key-status", String(error), true);
  } finally {
    providerBusy = false;
    syncProvider();
  }
}

async function copyOutput(button, output) {
  try {
    await navigator.clipboard.writeText(output.textContent);
    button.textContent = "已复制";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(output);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    button.textContent = "已选中，请按 Ctrl+C";
  }
}

function addTurn({ question, result }) {
  const turn = document.createElement("article");
  turn.className = "turn";
  const reply = document.createElement("section");
  reply.className = "reply";
  reply.append(textElement("h3", "分析"), textElement("p", result.analysis));
  if (result.deliverable.trim()) {
    const deliverable = document.createElement("section");
    deliverable.className = "deliverable";
    const heading = document.createElement("div");
    heading.className = "output-heading";
    const button = textElement("button", "复制成果", "quiet");
    button.type = "button";
    const output = textElement("pre", result.deliverable, "deliverable-text");
    button.addEventListener("click", () => void copyOutput(button, output));
    heading.append(textElement("h3", "可用成果"), button);
    deliverable.append(heading, output);
    reply.append(deliverable);
  }
  if (result.nextStep.trim()) {
    const next = document.createElement("section");
    next.className = "next-step";
    next.append(textElement("h3", "下一步"), textElement("p", result.nextStep));
    reply.append(next);
  }
  turn.append(textElement("p", question, "question-bubble"), reply);
  el("conversation").append(turn);
  return turn;
}

async function sendQuestion(event) {
  event.preventDefault();
  if (workBusy || providerBusy || !provider.configured) return;
  const input = el("question");
  const question = input.value.trim();
  if (!question) {
    input.focus();
    return;
  }
  workBusy = true;
  syncProvider();
  status("work-status", "DeepSeek 正在处理这件事…");
  let turn;
  try {
    const result = await invoke("work_on_problem", {
      question,
      history: conversation.slice(-contextTurns)
    });
    const completed = { question, result };
    turn = addTurn(completed);
    conversation.push(completed);
    input.value = "";
    provider.verified = true;
    status("work-status", "");
  } catch (error) {
    provider.verified = false;
    status("work-status", String(error), true);
  } finally {
    workBusy = false;
    syncProvider();
  }
  if (!el("view-workspace").hidden) {
    input.focus({ preventScroll: true });
    turn?.scrollIntoView({ block: "start" });
  }
}

function initialize() {
  for (const button of navigation)
    button.addEventListener("click", () => showView(button.dataset.view));
  el("open-connection").addEventListener("click", () => showView("connections", true));
  for (const starter of starters)
    starter.addEventListener("click", () => {
      starterPrompt = starter.dataset.starter;
      syncWorkspace();
      el("question").focus();
    });
  el("new-problem").addEventListener("click", () => {
    if (workBusy || !window.confirm("当前对话只保留在这个窗口。确定要开启新问题吗？")) return;
    conversation.length = 0;
    starterPrompt = "";
    el("conversation").replaceChildren();
    el("question").value = "";
    status("work-status", "");
    syncWorkspace();
    el("question").focus();
  });
  el("composer").addEventListener("submit", sendQuestion);
  el("key-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (providerBusy || workBusy || !invoke) return;
    const key = el("api-key").value.trim();
    if (!key) return;
    void changeProvider(
      "save_deepseek_key",
      { key },
      "正在验证 DeepSeek Flash…",
      "连接成功。密钥已保存，可以回到工作台。"
    );
  });
  el("test-key").addEventListener(
    "click",
    () =>
      void changeProvider(
        "check_deepseek",
        undefined,
        "正在测试 DeepSeek Flash…",
        "连接成功，可以回到工作台。"
      )
  );
  el("clear-key").addEventListener(
    "click",
    () =>
      void changeProvider(
        "clear_deepseek_key",
        undefined,
        "正在移除密钥…",
        "已移除保存的本机密钥。"
      )
  );
  syncProvider();
  if (invoke) {
    void readProvider().catch((error) => status("key-status", String(error), true));
  } else {
    el("ai-unavailable-copy").textContent = "请在 StepMark Windows 软件中连接 DeepSeek。";
  }
  initializeAccountPanel(invoke);
}

initialize();
