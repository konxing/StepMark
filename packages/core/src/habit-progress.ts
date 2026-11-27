/**
 * StepMark visual growth indicator, policy v3. This 0-100 value is a user-facing
 * heuristic, NOT a probability of habit formation nor a validated SRBAI score.
 * Observed repetitions and automaticity are deliberately kept separate.
 */
import { wilsonInterval } from "./measurement";

export const HABIT_PROGRESS_POLICY_VERSION = "habit-progress-v3";
export const HABIT_RECENT_OPPORTUNITY_LIMIT = 12;
export type InitiationLevel = 0 | 1 | 2 | 3 | 4;
export type ReflectionSource = "self_report" | "ai_interpretation";
export interface InitiationEvidence {
  atMs: number;
  /** Local calendar date recorded with a dated opportunity, when available. */
  localDate?: string | undefined;
  level: InitiationLevel;
  source: ReflectionSource;
  confidence: number; // for AI only; self-report is always retained as stated
}
export interface HabitProgressInput {
  completedRepetitions: number;
  eligibleOpportunities: number;
  completedOpportunities: number;
  recentOpportunities?: { eligible: number; completed: number };
  observations: readonly InitiationEvidence[];
  nowMs: number;
  lastCompletedAtMs?: number | null;
  seed?: string;
  reviewEnabled?: boolean;
}
export type HabitStage =
  "collecting_evidence" | "developing" | "maintaining" | "review_due" | "needs_fresh_evidence";
export interface HabitProgress {
  policyVersion: typeof HABIT_PROGRESS_POLICY_VERSION;
  progress: number;
  repetitionSignal: number;
  automaticitySignal: number | null;
  evidenceLevel: "insufficient" | "limited" | "moderate" | "repeated";
  stage: HabitStage;
  completedRepetitions: number;
  /** Includes observed eligible opportunities only. No inference about missing records. */
  eligibleOpportunities: number;
  /** Proportion in [0, 1], or null when no eligible opportunities are recorded. */
  observedCompletionRate: number | null;
  recentExecution: { eligible: number; completed: number; inconsistent: boolean } | null;
  evidenceCount: number;
  /** AI-coded annotations in the function input, never scored; public API may replace this with a separate owner-scoped historical count. */
  aiAnnotationCount: number;
  evidenceSpanDays: number;
  evidenceStale: boolean;
  lastRatingAt: string | null;
  mostRecentAutomaticity: number | null;
  reviewDue: boolean;
  nextReviewAt: string | null;
  reviewReason:
    | "none"
    | "low_evidence"
    | "routine_check"
    | "maintenance"
    | "recent_difficulty"
    | "recent_misses";
  note: string;
}
const DAY = 24 * 60 * 60 * 1000;
const STABLE_SCORE = 80;
const levelStrength: Record<InitiationLevel, number> = { 0: 0, 1: 15, 2: 35, 3: 70, 4: 100 };

export function calculateHabitProgress(input: HabitProgressInput): HabitProgress {
  validateProgressInput(input);
  const { completedRepetitions, eligibleOpportunities, completedOpportunities, nowMs } = input;

  // The sample uses recorded opportunities. Passing time alone never lifts its cap.
  const sample = input.recentOpportunities;
  const recentInterval =
    sample && sample.eligible >= 6 ? wilsonInterval(sample.completed, sample.eligible) : null;
  const recentMisses = recentInterval !== null && recentInterval.high < 0.8;
  const recentExecution =
    sample && sample.eligible > 0 ? { ...sample, inconsistent: recentMisses } : null;

  const { ratings, aiAnnotationCount } = prepareRatingEvidence(input.observations, nowMs);
  const count = ratings.length;
  const latest = ratings[0];
  const oldest = ratings.at(-1);
  const span = latest && oldest ? (latest.atMs - oldest.atMs) / DAY : 0;
  const daysSinceLastRating = latest ? Math.max(0, (nowMs - latest.atMs) / DAY) : null;
  // 45 days is a UI freshness threshold. Older ratings still contribute to the score.
  const evidenceStale = daysSinceLastRating !== null && daysSinceLastRating > 45;

  const repetitionSignal = 100 * -Math.expm1(-completedRepetitions / 55);
  const automaticitySignal = latest ? scoreAutomaticity(ratings, latest.atMs) : null;
  // The amount and spread of direct ratings determine how high the progress can go.
  const cap = count === 0 ? 45 : count === 1 ? 65 : count === 2 ? 80 : span >= 14 ? 96 : 85;
  const raw = 0.45 * repetitionSignal + 0.55 * (automaticitySignal ?? 0);
  const supportedCap = recentMisses ? Math.min(cap, STABLE_SCORE - 0.1) : cap;
  const progress = Number(between(raw, 0, supportedCap).toFixed(1));
  const evidenceLevel =
    count === 0
      ? "insufficient"
      : count === 1
        ? "limited"
        : count === 2 || span < 14
          ? "moderate"
          : "repeated";
  const lastRating = latest ? levelStrength[latest.level] : null;
  const stable =
    evidenceLevel === "repeated" &&
    completedRepetitions >= 20 &&
    progress >= STABLE_SCORE &&
    lastRating !== null &&
    lastRating >= 70;

  const { reviewDue, reviewReason, nextReviewMs } = reviewTiming(
    input,
    ratings,
    recentMisses,
    stable
  );
  const stage: HabitStage = reviewDue
    ? "review_due"
    : evidenceStale
      ? "needs_fresh_evidence"
      : stable
        ? "maintaining"
        : count === 0
          ? "collecting_evidence"
          : "developing";

  return {
    policyVersion: HABIT_PROGRESS_POLICY_VERSION,
    progress,
    repetitionSignal: Number(repetitionSignal.toFixed(1)),
    automaticitySignal: automaticitySignal === null ? null : Number(automaticitySignal.toFixed(1)),
    evidenceLevel,
    stage,
    completedRepetitions,
    eligibleOpportunities,
    observedCompletionRate:
      eligibleOpportunities === 0 ? null : completedOpportunities / eligibleOpportunities,
    recentExecution,
    evidenceCount: count,
    aiAnnotationCount,
    evidenceSpanDays: Number(span.toFixed(1)),
    evidenceStale,
    lastRatingAt: latest ? new Date(latest.atMs).toISOString() : null,
    mostRecentAutomaticity: lastRating,
    reviewDue,
    reviewReason,
    nextReviewAt:
      input.reviewEnabled === false || nextReviewMs === null
        ? null
        : new Date(nextReviewMs).toISOString(),
    note: "Exploratory progress combines recorded repetitions and direct self-ratings. A sustained pattern of recorded missed opportunities limits the score. AI diary interpretations remain provisional. Ability change is evaluated with independent tasks.",
  };
}

function validateProgressInput(input: HabitProgressInput): void {
  const { completedRepetitions, eligibleOpportunities, completedOpportunities, nowMs } = input;
  if (
    ![completedRepetitions, eligibleOpportunities, completedOpportunities].every(
      Number.isSafeInteger
    ) ||
    completedRepetitions < 0 ||
    eligibleOpportunities < 0 ||
    completedOpportunities < 0 ||
    completedOpportunities > eligibleOpportunities ||
    completedRepetitions !== completedOpportunities ||
    !Number.isFinite(nowMs) ||
    input.observations.length > 500 ||
    (input.lastCompletedAtMs != null &&
      (!Number.isFinite(input.lastCompletedAtMs) ||
        input.lastCompletedAtMs > nowMs + 5 * 60 * 1000))
  ) {
    throw new RangeError("invalid habit progress inputs");
  }

  const sample = input.recentOpportunities;
  if (
    sample &&
    (!Number.isSafeInteger(sample.eligible) ||
      !Number.isSafeInteger(sample.completed) ||
      sample.completed < 0 ||
      sample.completed > sample.eligible ||
      sample.completed > completedOpportunities ||
      sample.eligible > Math.min(HABIT_RECENT_OPPORTUNITY_LIMIT, eligibleOpportunities) ||
      sample.eligible - sample.completed > eligibleOpportunities - completedOpportunities)
  ) {
    throw new RangeError("invalid recent habit opportunities");
  }
}

function prepareRatingEvidence(evidence: readonly InitiationEvidence[], nowMs: number) {
  const observations = [...evidence].sort((a, b) => b.atMs - a.atMs);
  const ratings: InitiationEvidence[] = [];
  const dates = new Set<string>();
  let aiAnnotationCount = 0;

  for (const observation of observations) {
    if (
      !Number.isFinite(observation.atMs) ||
      observation.atMs > nowMs + 5 * 60 * 1000 ||
      observation.atMs < 0 ||
      !Number.isInteger(observation.level) ||
      observation.level < 0 ||
      observation.level > 4 ||
      !Number.isFinite(observation.confidence) ||
      observation.confidence < 0 ||
      observation.confidence > 1 ||
      (observation.source !== "self_report" && observation.source !== "ai_interpretation")
    ) {
      throw new RangeError("invalid subjective evidence");
    }
    // AI annotations are tracked separately from the person's own ratings.
    if (observation.source === "ai_interpretation") {
      aiAnnotationCount++;
      continue;
    }

    // Dated opportunities use the person's calendar day. Older records use the UTC day.
    if (observation.localDate !== undefined) {
      const date = new Date(observation.localDate + "T00:00:00.000Z");
      if (
        !/^\d{4}-\d{2}-\d{2}$/u.test(observation.localDate) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== observation.localDate
      ) {
        throw new RangeError("invalid local evidence date");
      }
    }
    const dateKey = observation.localDate ?? new Date(observation.atMs).toISOString().slice(0, 10);
    if (ratings.length >= 12 || dates.has(dateKey)) continue;
    dates.add(dateKey);
    ratings.push(observation);
  }
  return { ratings, aiAnnotationCount };
}

function scoreAutomaticity(
  ratings: readonly InitiationEvidence[],
  latestRatingAtMs: number
): number {
  let weighted = 0;
  let weights = 0;
  for (const rating of ratings) {
    // Relative age keeps the score stable until the person records another rating.
    const ageDays = Math.max(0, (latestRatingAtMs - rating.atMs) / DAY);
    const weight = Math.pow(0.5, ageDays / 35);
    weighted += levelStrength[rating.level] * weight;
    weights += weight;
  }
  return weighted / weights;
}

function reviewTiming(
  input: HabitProgressInput,
  ratings: readonly InitiationEvidence[],
  recentMisses: boolean,
  stable: boolean
): {
  reviewDue: boolean;
  reviewReason: HabitProgress["reviewReason"];
  nextReviewMs: number | null;
} {
  const [latest, previous] = ratings;
  const lastAnchor = latest?.atMs ?? input.lastCompletedAtMs ?? null;
  if (lastAnchor === null) {
    return { reviewDue: false, reviewReason: "none", nextReviewMs: null };
  }

  const recentDifficulty =
    latest !== undefined &&
    previous !== undefined &&
    latest.level <= 2 &&
    (previous.level - latest.level >= 2 ||
      ratings.slice(0, 3).every((rating) => rating.level <= 2));

  let reviewReason: HabitProgress["reviewReason"] = "routine_check";
  let baseInterval = 14;
  if (recentDifficulty) {
    reviewReason = "recent_difficulty";
    baseInterval = 6;
  } else if (recentMisses) {
    reviewReason = "recent_misses";
    baseInterval = 7;
  } else if (stable) {
    reviewReason = "maintenance";
    baseInterval = 28;
  } else if (ratings.length < 2) {
    reviewReason = "low_evidence";
    baseInterval = 7;
  }

  const interval = Math.max(5, baseInterval + (stable ? reviewJitter(input.seed ?? "") : 0));
  const nextReviewMs = lastAnchor + interval * DAY;
  return {
    reviewDue: input.reviewEnabled !== false && input.nowMs >= nextReviewMs,
    reviewReason,
    nextReviewMs,
  };
}

function between(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** A deterministic, reproducible jitter of {-2,-1,0,1,2} days. */
function reviewJitter(seed: string): number {
  let acc = 0;
  for (let index = 0; index < seed.length; index++) {
    acc = (acc * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return (acc % 5) - 2;
}
