const { sessionHandlers } = require("./session");
const { assistantHandlers } = require("./assistant");
const { practiceHandlers } = require("./practice");
const { habitHandlers } = require("./habits");
const { reflectionHandlers } = require("./reflections");

Page({
  data: {
    modules: [],
    dueReviews: [],
    status: "正在连接…",
    loading: false,
    authenticated: false,
    showAdvanced: false,

    chatMessages: [
      {
        id: "chat-welcome",
        role: "assistant",
        text: "说说你做了什么、怎么做的、结果怎么样。你也可以跟我聊习惯。"
      }
    ],
    chatInput: "",
    chatBusy: false,
    chatConsent: false,
    chatConsentUser: "",
    chatAvailability: "checking",
    chatStatus: "",
    recordGrowthEvidence: true,
    workEvidenceOpen: false,
    workEvidenceBusy: false,
    workEvidenceStatus: "",
    workEvidenceSummary: [],
    workEvidenceItems: [],
    workEvidenceNext: null,
    chatBottomId: "chat-welcome",
    chatRetryId: "",
    chatRetryMessage: "",

    creating: false,
    title: "",
    action: "",
    cue: "",
    selectedHabitId: "",
    progress: null,
    reflectionEventId: "",
    recentEvents: [],
    correcting: false,
    auditEventId: "",
    auditRows: [],
    auditNextOffset: null,
    auditLoading: false,

    practiceOpen: false,
    practiceBusy: false,
    practiceItem: null,
    practiceDomains: [],
    practiceSkill: "conditional",
    practiceSelected: "",
    practiceFeedback: null,
    practiceHintUsed: false,
    practiceNextReviewUtc: "",
    practiceRecommended: "",
    practiceStatus: "",

    feelingOptions: ["非常抗拒", "需要逼自己", "有一点纠结", "比较自然", "几乎不用思考"],
    feelIndex: -1,
    feedbackNote: "",
    aiConsent: false,
    recentReflections: []
  },

  ...sessionHandlers,
  ...assistantHandlers,
  ...practiceHandlers,
  ...habitHandlers,
  ...reflectionHandlers,

  onLoad() {
    this.bootstrap();
  },
  onShow() {
    if (this.data.authenticated) this.loadHabits();
  },
  toggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced });
  }
});
