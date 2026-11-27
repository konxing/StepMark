const { clearSession } = require("./session");

const habitHandlers = {
  async loadHabits() {
    try {
      const response = await this.api("/api/v1/habits", "GET");
      this.setData({ modules: response.habits || [], status: "已连接" });
      try {
        const due = await this.api("/api/v1/habits/due", "GET");
        this.setData({ dueReviews: (due.due || []).slice(0, 4) });
      } catch {
        this.setData({ dueReviews: [] });
      }
    } catch (e) {
      if (String(e.message).includes("已过期")) {
        clearSession();
        this.setData({ authenticated: false, status: "登录已过期，正在更新…" });
        this.bootstrap();
      } else this.setData({ status: e.message || "读取失败" });
    }
  },
  updateTitle(e) {
    this.setData({ title: e.detail.value });
  },
  updateAction(e) {
    this.setData({ action: e.detail.value });
  },
  updateCue(e) {
    this.setData({ cue: e.detail.value });
  },
  async createHabit() {
    if (this.data.creating || !this.data.title.trim() || !this.data.action.trim()) return;
    this.setData({ creating: true });
    try {
      await this.api("/api/v1/habits", "POST", {
        title: this.data.title,
        action: this.data.action,
        cue: this.data.cue || undefined
      });
      this.setData({ title: "", action: "", cue: "", status: "习惯已创建" });
      await this.loadHabits();
    } catch (e) {
      this.setData({ status: e.message || "创建失败" });
    } finally {
      this.setData({ creating: false });
    }
  },
  async record(e) {
    if (this.data.creating) return;
    const habitId = e.currentTarget.dataset.id;
    const kind = e.currentTarget.dataset.kind || "done";
    const date = new Date(),
      day =
        date.getFullYear() +
        "-" +
        String(date.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(date.getDate()).padStart(2, "0");
    this.setData({ creating: true });
    try {
      const saved = await this.api("/api/v1/observations", "POST", {
        habitId,
        opportunityKey: "daily:" + day,
        eligible: kind !== "no_cue",
        completed: kind === "done",
        occurredAt: new Date().toISOString()
      });
      this.setData({
        status:
          kind === "done"
            ? "执行已保存，欢迎补充感受（选填）。"
            : kind === "missed"
              ? "已记录：有机会但没有执行。"
              : "已记录：今天未出现触发情境。",
        reflectionEventId: kind === "done" ? saved.event.id : "",
        selectedHabitId: habitId,
        feelIndex: -1,
        feedbackNote: "",
        aiConsent: false
      });
      await this.loadHabits();
      await this.refreshProgress(habitId);
      await this.refreshEvents(habitId);
    } catch (e) {
      this.setData({ status: e.message || "记录失败" });
    } finally {
      this.setData({ creating: false });
    }
  },
  async openProgress(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      selectedHabitId: id,
      reflectionEventId: "",
      feelIndex: -1,
      feedbackNote: "",
      aiConsent: false,
      auditEventId: "",
      auditRows: [],
      auditNextOffset: null
    });
    await this.refreshProgress(id);
    await this.refreshEvents(id);
  },
  async refreshEvents(id) {
    try {
      const response = await this.api(
        "/api/v1/observations?habitId=" + encodeURIComponent(id),
        "GET"
      );
      this.setData({ recentEvents: (response.events || []).slice(0, 14) });
    } catch {
      this.setData({ recentEvents: [] });
    }
  },
  auditStateLabel(eligible, completed) {
    return !eligible ? "没有触发机会" : completed ? "已执行" : "有机会但未执行";
  },
  async loadAuditHistory(eventId, offset) {
    if (this.data.auditLoading) return;
    this.setData({ auditLoading: true });
    try {
      const response = await this.api(
        "/api/v1/observations/" + encodeURIComponent(eventId) + "?offset=" + offset,
        "GET"
      );
      const newRows = (response.corrections || []).map((row) => ({
        ...row,
        beforeLabel: this.auditStateLabel(row.previousEligible, row.previousCompleted),
        afterLabel: this.auditStateLabel(row.updatedEligible, row.updatedCompleted),
        dateLabel: new Date(row.correctedAt).toLocaleString("zh-CN")
      }));
      this.setData({
        auditEventId: eventId,
        auditRows: offset === 0 ? newRows : this.data.auditRows.concat(newRows),
        auditNextOffset: response.nextOffset
      });
    } catch (e) {
      this.setData({ status: "更正历史读取失败，请稍后重试。" });
    } finally {
      this.setData({ auditLoading: false });
    }
  },
  async toggleAuditHistory(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.auditLoading) return;
    if (this.data.auditEventId === id) {
      this.setData({ auditEventId: "", auditRows: [], auditNextOffset: null });
    } else {
      await this.loadAuditHistory(id, 0);
    }
  },
  async loadMoreAudit() {
    if (this.data.auditEventId && this.data.auditNextOffset !== null)
      await this.loadAuditHistory(this.data.auditEventId, this.data.auditNextOffset);
  },
  async correctOpportunity(e) {
    if (this.data.correcting || this.data.creating) return;
    const event = this.data.recentEvents.find((x) => x.id === e.currentTarget.dataset.id);
    const kind = e.currentTarget.dataset.kind;
    const id = this.data.selectedHabitId;
    if (!event || !id) return;
    const eligible = kind !== "no_cue",
      completed = kind === "done";
    if (event.eligible === eligible && event.completed === completed) return;
    this.setData({ correcting: true });
    try {
      await this.api("/api/v1/observations/" + event.id, "PUT", {
        expectedRevision: event.revision,
        eligible,
        completed
      });
      await Promise.all([this.refreshEvents(id), this.loadHabits(), this.refreshProgress(id)]);
      this.setData({
        auditEventId: "",
        auditRows: [],
        auditNextOffset: null,
        status: "已更正，可在记录中查看修改历史。"
      });
    } catch (e) {
      await this.refreshEvents(id);
      this.setData({
        status: "更正失败。若关联了感受记录，需先删除该感受；或检查记录是否已被其他设备修改。"
      });
    } finally {
      this.setData({ correcting: false });
    }
  },
  async toggleReview(e) {
    const habit = this.data.modules.find((h) => h.id === e.currentTarget.dataset.id);
    if (!habit) return;
    try {
      await this.api("/api/v1/habits/" + habit.id + "/reviews", "PUT", {
        enabled: !habit.reviewEnabled
      });
      await this.loadHabits();
      await this.refreshProgress(habit.id);
      this.setData({ status: habit.reviewEnabled ? "复查提示已关闭" : "复查提示已开启" });
    } catch (e) {
      this.setData({ status: e.message || "修改设置失败" });
    }
  }
};

module.exports = { habitHandlers };
