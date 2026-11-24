export const growthDimensions = [
  "thinking", "expression", "observation", "prediction",
  "tools", "creation", "collaboration", "direction"
] as const;

export type GrowthDimension = typeof growthDimensions[number];

export const growthPrompts: Record<GrowthDimension, {
  label: string;
  question: string;
  action: string;
  criterion: string;
}> = {
  thinking: {
    label: "思考与学习",
    question: "我究竟卡在哪一步？现有解释还能怎样验证？",
    action: "写下两个可能的原因，先验证最容易排除的一个。",
    criterion: "找到一个能区分两种解释的事实，并说明它支持哪种解释。"
  },
  expression: {
    label: "语言与表达",
    question: "为什么听众没能复述我想表达的重点？",
    action: "先用一句话交代结论，再请听众复述听懂的内容。",
    criterion: "听众能用自己的话说出结论与其中一个依据。"
  },
  observation: {
    label: "观察",
    question: "我看到和听到了什么？哪些判断是我后来加上的？",
    action: "分别记录能复述的原话或动作，以及它们的两种可能解释。",
    criterion: "列出具体的观察，并说明什么信息能区分这两种解释。"
  },
  prediction: {
    label: "预测",
    question: "我预计会发生什么，什么时候能确认？",
    action: "事先写下判断、概率和截止日期，到期核对实际结果。",
    criterion: "在行动前确定什么结果算发生，以及到时由什么记录确认。"
  },
  tools: {
    label: "使用工具",
    question: "哪个重复动作值得交给工具？我怎样验收？",
    action: "取一个小样本，记录原有做法，再让工具完成同一个任务。",
    criterion: "比较耗时和结果，抽查至少一个容易出错的地方。"
  },
  creation: {
    label: "创造产品",
    question: "谁遇到了什么具体问题，我能做出什么小东西来验证？",
    action: "做一个能完成核心动作的原型，让一位潜在用户试用。",
    criterion: "记录对方是否独立完成，以及实际卡住的位置。"
  },
  collaboration: {
    label: "协作",
    question: "哪些分歧或信息差正在影响我们完成这件事？",
    action: "找一位参与者对齐目标、各自负责的部分和交付时间。",
    criterion: "双方能各自复述同一个目标，以及自己的下一步。"
  },
  direction: {
    label: "自主选择方向",
    question: "我有哪两个真正愿意投入的方向？还缺什么信息来取舍？",
    action: "各做一次能在一个晚上完成的小尝试，再比较实际体验。",
    criterion: "写下取舍依据、当前选择，以及什么新证据会让我改变主意。"
  }
};

export const growthLimits = {
  title: 120, question: 600, nextAction: 500, successCriteria: 500,
  evidence: 1500, reflection: 1000, nextQuestion: 600
} as const;

export type GrowthPlan = {
  dimension: GrowthDimension;
  title: string;
  question: string;
  nextAction: string;
  successCriteria: string;
};

export type GrowthReview = {
  evidence: string;
  reflection: string;
  nextQuestion: string;
};

export type GrowthPractice = GrowthPlan & GrowthReview & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type GrowthReviewDraft = Pick<GrowthReview,"reflection"|"nextQuestion">;

export function hasGrowthReview(review: Pick<GrowthReview,"evidence"|"reflection">): boolean {
  return review.evidence.trim().length >= 2 && review.reflection.trim().length >= 2;
}
