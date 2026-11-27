const practiceHandlers = {
  async openPractice() {
    if (this.data.practiceOpen) {
      this.setData({ practiceOpen: false });
      return;
    }
    this.setData({ practiceOpen: true });
    await this.loadPractice("");
  },
  async loadPractice(skill) {
    if (this.data.practiceBusy) return;
    this.setData({ practiceBusy: true, practiceStatus: "正在加载训练题…" });
    try {
      const query = skill ? "?skill=" + encodeURIComponent(skill) : "";
      const result = await this.api("/api/v1/practice" + query, "GET");
      this.setData({
        practiceDomains: result.skills || [],
        practiceSkill: result.skill,
        practiceItem: result.item,
        practiceRecommended: result.recommendedSkill || "",
        practiceSelected: "",
        practiceFeedback: null,
        practiceHintUsed: false,
        practiceNextReviewUtc: result.nextReviewUtc || "",
        practiceStatus: result.item
          ? "按自己的判断选择答案，提交后查看解析。"
          : "这个类别今天已练完，可换一个题型或明天再来。"
      });
    } catch (e) {
      this.setData({ practiceStatus: e.message || "训练题加载失败" });
    } finally {
      this.setData({ practiceBusy: false });
    }
  },
  async changePracticeSkill(e) {
    const skill = e.currentTarget.dataset.skill;
    if (skill && !this.data.practiceBusy) await this.loadPractice(skill);
  },
  choosePracticeAnswer(e) {
    this.setData({ practiceSelected: e.detail.value });
  },
  showPracticeHint() {
    this.setData({ practiceHintUsed: true });
  },
  async submitPractice() {
    if (
      this.data.practiceBusy ||
      this.data.practiceFeedback ||
      !this.data.practiceSelected ||
      !this.data.practiceItem
    )
      return;
    this.setData({ practiceBusy: true });
    try {
      const result = await this.api("/api/v1/practice", "POST", {
        itemId: this.data.practiceItem.id,
        selectedKey: this.data.practiceSelected,
        hintUsed: this.data.practiceHintUsed
      });
      this.setData({
        practiceFeedback: result,
        practiceStatus: "练习记录已保存，不影响正式测验分数。"
      });
    } catch (e) {
      this.setData({ practiceStatus: e.message || "提交失败，请刷新练习状态" });
    } finally {
      this.setData({ practiceBusy: false });
    }
  },
  async nextPractice() {
    await this.loadPractice(this.data.practiceSkill);
  }
};

module.exports = { practiceHandlers };
