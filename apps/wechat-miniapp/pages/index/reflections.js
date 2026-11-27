const reflectionHandlers = {
  async refreshProgress(id) {
    try {
      const progress = await this.api("/api/v1/habits/" + id + "/progress", "GET");
      this.setData({ selectedHabitId: id, progress });
      try {
        const data = await this.api("/api/v1/habits/" + id + "/reflections", "GET");
        const labels = {
          DISABLED: "未启用",
          PENDING: "待分析",
          PROCESSING: "分析中",
          COMPLETED: "已分析",
          FAILED: "分析失败"
        };
        this.setData({
          recentReflections: (data.reflections || []).slice(0, 5).map((x) => ({
            ...x,
            aiStatusLabel: labels[x.aiStatus] || "未知"
          }))
        });
      } catch {
        this.setData({ recentReflections: [] });
      }
    } catch (e) {
      this.setData({ status: e.message || "读取进度失败" });
    }
  },
  chooseFeeling(e) {
    this.setData({ feelIndex: Number(e.detail.value) });
  },
  updateFeelingNote(e) {
    this.setData({ feedbackNote: e.detail.value });
  },
  setAiConsent(e) {
    this.setData({ aiConsent: e.detail.value });
  },
  async saveReflection() {
    if (this.data.creating) return;
    const id = this.data.selectedHabitId;
    const text = this.data.feedbackNote.trim();
    if (!id || (!text && this.data.feelIndex < 0)) return;
    const body = { aiConsent: Boolean(this.data.aiConsent && text) };
    if (text) body.note = text;
    if (this.data.feelIndex >= 0) body.initiationLevel = this.data.feelIndex;
    if (this.data.reflectionEventId) body.eventId = this.data.reflectionEventId;
    this.setData({ creating: true });
    try {
      const result = await this.api("/api/v1/habits/" + id + "/reflections", "POST", body);
      this.setData({
        status:
          result.reflection.aiStatus === "PENDING"
            ? "感受已保存。AI 将异步分析；无需重复提交。"
            : "感受已保存，尚未向外部 AI 发送。",
        feedbackNote: "",
        feelIndex: -1,
        aiConsent: false,
        reflectionEventId: ""
      });
      await this.refreshProgress(id);
    } catch (e) {
      this.setData({ status: e.message || "保存感受失败" });
    } finally {
      this.setData({ creating: false });
    }
  },
  async controlReflection(e) {
    if (this.data.creating) return;
    const habitId = this.data.selectedHabitId;
    const reflectionId = e.currentTarget.dataset.id;
    const action = e.currentTarget.dataset.action;
    if (!habitId || !reflectionId) return;
    if (action === "delete") {
      const confirmed = await new Promise((resolve) =>
        wx.showModal({
          title: "删除感受记录",
          content: "从 StepMark 删除这条感受和本地分析。此前发送给第三方 AI 的文字无法收回。",
          success: (res) => resolve(res.confirm),
          fail: () => resolve(false)
        })
      );
      if (!confirmed) return;
    }
    this.setData({ creating: true });
    try {
      const result = await this.api(
        "/api/v1/habits/" + habitId + "/reflections/" + reflectionId,
        action === "delete" ? "DELETE" : "PUT"
      );
      await this.refreshProgress(habitId);
      this.setData({
        status: result.mayHaveBeenSentToProvider
          ? "已更新本地记录；此前已发送给服务商的文字不能撤回。"
          : action === "delete"
            ? "这条感受已从 StepMark 删除。"
            : "已撤回后续 AI 分析授权。"
      });
    } catch (e) {
      this.setData({ status: e.message || "修改失败；如果 AI 正在处理，请稍后重试。" });
    } finally {
      this.setData({ creating: false });
    }
  },
  async addSelfRating(e) {
    if (this.data.creating) return;
    const habitId = this.data.selectedHabitId;
    const reflectionId = e.currentTarget.dataset.id;
    const initiationLevel = Number(e.detail.value);
    if (
      !habitId ||
      !reflectionId ||
      !Number.isInteger(initiationLevel) ||
      initiationLevel < 0 ||
      initiationLevel >= this.data.feelingOptions.length
    )
      return;
    this.setData({ creating: true });
    try {
      await this.api(`/api/v1/habits/${habitId}/reflections/${reflectionId}`, "POST", {
        initiationLevel
      });
      if (this.data.selectedHabitId === habitId) await this.refreshProgress(habitId);
      this.setData({ status: "本人启动感受已保存。" });
    } catch (e) {
      this.setData({ status: e.message || "无法确认是否保存，稍后可重试同一选项。" });
    } finally {
      this.setData({ creating: false });
    }
  }
};

module.exports = { reflectionHandlers };
