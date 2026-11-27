const { getAccessToken } = require("./session");
const assistantEndpoint = "/api/v1/assistant";

function preferencesKey(userId) {
  return `stepmark:assistant-preferences:v1:${getApp().globalData.apiBase}:${userId}`;
}

function readPreferences(userId) {
  try {
    const stored = wx.getStorageSync(preferencesKey(userId));
    return {
      chatConsent: stored?.chatConsent === true,
      recordGrowthEvidence: stored?.recordGrowthEvidence !== false
    };
  } catch {
    return { chatConsent: false, recordGrowthEvidence: true };
  }
}

function updatePreferences(page, preferences) {
  const userId = page.data.chatConsentUser;
  if (!userId) return;

  const next = {
    chatConsent: page.data.chatConsent,
    recordGrowthEvidence: page.data.recordGrowthEvidence,
    ...preferences
  };
  page.setData({ ...next, chatStatus: "" });
  try {
    wx.setStorageSync(preferencesKey(userId), next);
  } catch {
    page.setData({ chatStatus: "未能记住授权设置。当前页面已更新，重新进入时请确认开关状态。" });
  }
}

const assistantHandlers = {
  async loadChatAvailability() {
    const token = getAccessToken();
    if (!this.data.authenticated || !token) return;

    const check = {};
    this.chatAvailabilityCheck = check;
    this.setData({ chatAvailability: "checking", chatStatus: "" });
    const isCurrent = () =>
      this.chatAvailabilityCheck === check && token === getAccessToken();
    try {
      const status = await this.api(assistantEndpoint, "GET");
      if (!isCurrent()) return;
      if (
        typeof status?.configured !== "boolean" ||
        typeof status.userId !== "string" ||
        !status.userId
      ) {
        throw new Error("Invalid assistant status");
      }
      this.setData({
        ...readPreferences(status.userId),
        chatConsentUser: status.userId,
        chatAvailability: status.configured ? "ready" : "unconfigured"
      });
    } catch {
      if (isCurrent()) this.setData({ chatAvailability: "unavailable" });
    }
  },
  onChatInput(e) {
    this.setData({ chatInput: e.detail.value });
  },
  onChatConsent(e) {
    updatePreferences(this, { chatConsent: e.detail.value === true });
  },
  onGrowthEvidenceConsent(e) {
    updatePreferences(this, { recordGrowthEvidence: e.detail.value === true });
  },
  appendChat(role, text) {
    const id = "chat-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
    this.setData({
      chatMessages: this.data.chatMessages.concat([{ id, role, text }]).slice(-14),
      chatBottomId: id
    });
  },
  newRequestId() {
    // This is an idempotency identifier, never an authentication credential.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const v = Math.floor(Math.random() * 16);
      return (c === "x" ? v : (v & 3) | 8).toString(16);
    });
  },
  localCalendarDay() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  },
  async sendChat() {
    const message = this.data.chatInput.trim();
    const token = getAccessToken();
    const userId = this.data.chatConsentUser;
    if (
      this.data.chatBusy ||
      message.length < 2 ||
      !this.data.authenticated ||
      this.data.chatAvailability !== "ready" ||
      !this.data.chatConsent ||
      !userId ||
      !token
    ) {
      return;
    }

    const retry = this.data.chatRetryMessage === message && this.data.chatRetryId;
    const requestId = retry ? this.data.chatRetryId : this.newRequestId();
    this.setData({
      chatBusy: true,
      chatStatus: "正在理解并检查记录…",
      chatInput: "",
      chatRetryId: requestId,
      chatRetryMessage: message
    });
    if (!retry) this.appendChat("user", message);
    try {
      const result = await this.api(assistantEndpoint, "POST", {
        message,
        requestId,
        localDate: this.localCalendarDay(),
        consentToAI: true,
        consentUserId: userId,
        recordGrowthEvidence: this.data.recordGrowthEvidence
      });
      if (token !== getAccessToken()) return;
      if (typeof result.reply !== "string") throw new Error("AI 响应不完整");
      this.appendChat(
        "assistant",
        result.workEvidenceAdded
          ? `${result.reply}\n已更新 ${result.workEvidenceAdded} 条成长证据。`
          : result.reply
      );
      if (result.workEvidenceAdded && this.data.workEvidenceOpen) await this.loadWorkEvidence(0);
      if (token !== getAccessToken()) return;
      this.setData({ chatStatus: "", chatRetryId: "", chatRetryMessage: "" });
      const habitId =
        (result.change && result.change.habitId) || (result.progress && result.progress.habitId);
      if (result.change) await this.loadHabits();
      if (habitId) {
        this.setData({ selectedHabitId: habitId, reflectionEventId: "" });
        await this.refreshProgress(habitId);
        await this.refreshEvents(habitId);
      }
    } catch (e) {
      if (token !== getAccessToken()) return;
      if (e.code === "ASSISTANT_CONSENT_ACCOUNT_CHANGED") {
        this.setData({
          chatInput: message,
          chatConsent: false,
          chatConsentUser: "",
          chatRetryId: "",
          chatRetryMessage: ""
        });
        await this.loadChatAvailability();
        if (token === getAccessToken()) {
          this.setData({ chatStatus: "登录账户已切换。请确认当前账户与授权后再发送。" });
        }
        return;
      }
      if (e.code === "ASSISTANT_NOT_CONFIGURED") {
        this.setData({ chatAvailability: "unconfigured" });
      }
      this.setData({
        chatInput: message,
        chatStatus: e.message || "无法确认是否已保存，请先核查习惯记录，再决定是否重试。"
      });
    } finally {
      if (token === getAccessToken()) this.setData({ chatBusy: false });
    }
  },
  async toggleWorkEvidence() {
    const opened = !this.data.workEvidenceOpen;
    this.setData({ workEvidenceOpen: opened });
    if (opened) await this.loadWorkEvidence(0);
  },
  async loadWorkEvidence(offset) {
    if (this.data.workEvidenceBusy) return;
    const token = getAccessToken();
    this.setData({ workEvidenceBusy: true, workEvidenceStatus: "" });
    try {
      const page = await this.api(
        `/api/v1/assistant/evidence?offset=${offset}&localDate=${this.localCalendarDay()}`,
        "GET"
      );
      if (token !== getAccessToken()) return;
      const items = page.items.map((item) => ({
        ...item,
        label: page.labels[item.domain] || item.domain
      }));
      this.setData({
        workEvidenceSummary: page.summary,
        workEvidenceNext: page.nextOffset,
        workEvidenceItems: offset ? [...this.data.workEvidenceItems, ...items] : items
      });
    } catch (e) {
      this.setData({ workEvidenceStatus: e.message || "成长证据暂时无法读取。" });
    } finally {
      this.setData({ workEvidenceBusy: false });
    }
  },
  moreWorkEvidence() {
    if (this.data.workEvidenceNext !== null)
      return this.loadWorkEvidence(this.data.workEvidenceNext);
  },
  retryWorkEvidence() {
    return this.loadWorkEvidence(0);
  },
  async deleteWorkEvidence(e) {
    if (this.data.workEvidenceBusy) return;
    const id = e.currentTarget.dataset.id;
    const confirmed = await new Promise((resolve) =>
      wx.showModal({
        title: "删除成长证据",
        content: "删除这条证据后，对应统计也会更新。",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false)
      })
    );
    if (!confirmed || this.data.workEvidenceBusy) return;
    this.setData({ workEvidenceBusy: true, workEvidenceStatus: "" });
    try {
      await this.api(`/api/v1/assistant/evidence?id=${encodeURIComponent(id)}`, "DELETE");
      this.setData({
        workEvidenceItems: this.data.workEvidenceItems.filter((item) => item.id !== id),
        workEvidenceBusy: false
      });
      await this.loadWorkEvidence(0);
    } catch (e) {
      this.setData({ workEvidenceStatus: e.message || "删除结果未确认。" });
    } finally {
      this.setData({ workEvidenceBusy: false });
    }
  }
};

module.exports = { assistantHandlers };
