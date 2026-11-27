import type { FormEvidenceStatus, ItemIntegrity } from "@stepmark/core";

export const logicSkills = ["conditional", "evidence", "quantitative"] as const;
export type LogicSkill = (typeof logicSkills)[number];

export interface CoachingForm {
  status: FormEvidenceStatus;
  integrityStatus: ItemIntegrity;
  correct: number | null;
  total: number;
  completedAt: string | null;
  availableAt: string | null;
  skills: { code: LogicSkill; label: string; correct: number | null; total: number }[];
}

export interface CoachingOverview {
  aiConfigured: boolean;
  canCoach: boolean;
  baseline: CoachingForm;
  retest: CoachingForm;
  recommendedFocus: LogicSkill | null;
  linkedHabits: {
    id: string;
    title: string;
    progress: { score: number; completed: number; eligible: number; ratings: number };
    recordedTrainingBetweenTests: number | null;
  }[];
  rawDifferencePoints: number | null;
}

export interface CoachingDraft {
  focus: LogicSkill;
  title: string;
  action: string;
  cue: string;
  minutes: number;
  minimumAction: string;
  successCriteria: string;
  example: string;
  reason: string;
}

export interface CoachingSuggestion {
  draft: CoachingDraft;
  source: "ai" | "built_in";
}
