const { requestApi } = require("../../lib/api");
const TOKEN_KEY = "stepmark_mobile_access";
const EXPIRES_KEY = "stepmark_mobile_expires";

function getAccessToken() {
  return wx.getStorageSync(TOKEN_KEY);
}
function clearSession() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(EXPIRES_KEY);
}

const sessionHandlers = {
  api(path, method, data, authenticated = true) {
    return requestApi({
      apiBase: getApp().globalData.apiBase,
      path,
      method,
      data,
      accessToken: authenticated ? getAccessToken() : null,
      authenticated
    });
  },
  async bootstrap() {
    if (this.data.loading) return;
    this.setData({ loading: true, status: "正在安全登录…" });
    try {
      const expires = Number(wx.getStorageSync(EXPIRES_KEY) || 0);
      const token = getAccessToken();
      if (!token || expires < Date.now() + 60 * 1000) {
        clearSession();
        const login = await new Promise((resolve, reject) => {
          wx.login({
            success: (res) =>
              res.code ? resolve(res.code) : reject(new Error("微信登录未返回凭证")),
            fail: () => reject(new Error("无法调用微信登录"))
          });
        });
        const auth = await this.api("/api/v1/auth/wechat", "POST", { code: login }, false);
        if (!auth.accessToken || !auth.expiresAt) throw new Error("登录响应无效");
        wx.setStorageSync(TOKEN_KEY, auth.accessToken);
        wx.setStorageSync(EXPIRES_KEY, new Date(auth.expiresAt).getTime());
      }
      this.setData({ authenticated: true, status: "已连接", chatBusy: false });
      void this.loadChatAvailability();
      await this.loadHabits();
    } catch (e) {
      this.setData({ authenticated: false, status: e.message || "暂无法连接" });
    } finally {
      this.setData({ loading: false });
    }
  },
  async logout() {
    this.chatAvailabilityCheck = null;
    this.setData({ chatAvailability: "checking", chatConsentUser: "", chatConsent: false });
    try {
      await this.api("/api/v1/auth/wechat/logout", "POST", {});
    } catch (e) {
      /* Best effort: revoke server session when reachable. */
    }
    clearSession();
    this.setData({
      authenticated: false,
      modules: [],
      dueReviews: [],
      recentEvents: [],
      chatInput: "",
      chatBusy: false,
      chatConsent: false,
      chatConsentUser: "",
      chatAvailability: "checking",
      chatRetryId: "",
      chatRetryMessage: "",
      recordGrowthEvidence: true,
      workEvidenceOpen: false,
      workEvidenceBusy: false,
      workEvidenceStatus: "",
      workEvidenceSummary: [],
      workEvidenceItems: [],
      workEvidenceNext: null,
      chatMessages: [
        { id: "chat-welcome", role: "assistant", text: "登录后，我可以帮你记录行动与感受。" }
      ],
      chatBottomId: "chat-welcome",
      chatStatus: "",
      auditEventId: "",
      auditRows: [],
      auditNextOffset: null,
      practiceOpen: false,
      practiceItem: null,
      practiceFeedback: null,
      practiceSelected: "",
      practiceDomains: [],
      practiceHintUsed: false,
      practiceNextReviewUtc: "",
      status: "已退出登录"
    });
  }
};

module.exports = { sessionHandlers, getAccessToken, clearSession };
