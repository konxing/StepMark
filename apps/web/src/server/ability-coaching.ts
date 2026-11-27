import { calculateHabitProgress } from "@stepmark/core";
import type { CoachingForm, CoachingOverview, LogicSkill } from "@/lib/ability-coaching";
import { isAiProviderConfigured } from "./ai-gateway";
import { getLogicFormOverview, RETEST_WAIT_DAYS } from "./assessment-forms";
import { getDb } from "./db";
import {
  habitSelfRatingEvidence,
  MAX_ACTIVE_HABITS,
  readHabitOpportunityCounts,
  recentHabitSelfRatings
} from "./habit-service";
import { logicTrainingConstruct, readLogicTrainingCounts } from "./habit-training-evidence";
import { ApiError } from "./security";

const constructCode = logicTrainingConstruct;
type LogicOverview = Awaited<ReturnType<typeof getLogicFormOverview>>;
type LogicForm = LogicOverview["forms"][number];

function verified(form: LogicForm): boolean {
  return form.status === "completed" && form.integrityStatus === "verified";
}

function summarize(form: LogicForm): CoachingForm {
  const isVerified = verified(form);
  return {
    status: form.status,
    integrityStatus: form.integrityStatus,
    correct: isVerified ? form.correct : null,
    total: form.total,
    completedAt: isVerified ? form.completedAt : null,
    availableAt: form.availableAt,
    skills: form.dimensions.map(({ attempted: _attempted, ...skill }) => ({
      ...skill,
      correct: isVerified ? skill.correct : null
    }))
  };
}

export async function requireCoachingBaseline(userId: string, focus: LogicSkill) {
  const overview = await getLogicFormOverview(userId);
  const baseline = overview.forms[0]!;
  if (!verified(baseline)) throw new ApiError(409, "VERIFIED_BASELINE_REQUIRED");
  const skill = baseline.dimensions.find((row) => row.code === focus)!;
  return { focus, correct: skill.correct!, total: skill.total };
}

async function linkedProgress(
  userId: string,
  now: Date,
  baselineAt: string | null,
  retestStartedAt: string | null
): Promise<CoachingOverview["linkedHabits"]> {
  const db = getDb();
  const habits = await db.habit.findMany({
    where: { userId, archivedAt: null, associations: { some: { constructCode } } },
    select: { id: true, title: true, reviewEnabled: true, reflections: recentHabitSelfRatings },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_ACTIVE_HABITS
  });
  const habitIds = habits.map((habit) => habit.id);
  const [counts, trainingCounts] = await Promise.all([
    readHabitOpportunityCounts(db, habitIds),
    readLogicTrainingCounts(habitIds, baselineAt, retestStartedAt ? new Date(retestStartedAt) : now)
  ]);
  return habits.map((habit) => {
    const { eligible, completed, lastCompletedAtMs, recentOpportunities } = counts.get(habit.id)!;
    const progress = calculateHabitProgress({
      completedRepetitions: completed,
      eligibleOpportunities: eligible,
      completedOpportunities: completed,
      observations: habitSelfRatingEvidence(habit.reflections),
      recentOpportunities,
      lastCompletedAtMs,
      nowMs: now.getTime(),
      seed: habit.id,
      reviewEnabled: habit.reviewEnabled
    });
    return {
      id: habit.id,
      title: habit.title,
      progress: { score: progress.progress, completed, eligible, ratings: progress.evidenceCount },
      recordedTrainingBetweenTests: trainingCounts.get(habit.id) ?? null
    };
  });
}

export async function getCoachingOverview(userId: string): Promise<CoachingOverview> {
  const now = new Date();
  const overview = await getLogicFormOverview(userId, now);
  const [baseline, retest] = overview.forms;
  const before = summarize(baseline!);
  const after = summarize(retest!);
  const canCoach = verified(baseline!);
  // Each signed form has the same number of items per skill. Ties use the form's order.
  const recommendedFocus = canCoach
    ? [...before.skills].sort((a, b) => a.correct! - b.correct!)[0]!.code
    : null;
  const validRetest = before.completedAt && retest!.startedAt && verified(retest!) &&
    Date.parse(retest!.startedAt) - Date.parse(before.completedAt) >= RETEST_WAIT_DAYS * 86_400_000;
  const linkedHabits = await linkedProgress(userId, now, before.completedAt, retest!.startedAt);
  return {
    aiConfigured: isAiProviderConfigured("assistant"),
    canCoach,
    baseline: before,
    retest: after,
    recommendedFocus,
    linkedHabits,
    rawDifferencePoints: validRetest ? overview.measurementEvidence.rawComparison?.rawDifferencePoints ?? null : null
  };
}

export async function saveCoachingHabit(
  userId: string,
  { focus, title, action, cue }: { focus: LogicSkill; title: string; action: string; cue: string }
) {
  await requireCoachingBaseline(userId, focus);
  return getDb().$transaction(async (tx) => {
    // Serialize double-clicks and retries for this owner. Preserve the association's first timestamp.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE`;
    const construct = await tx.construct.findUnique({ where: { code: constructCode }, select: { code: true } });
    if (!construct) throw new ApiError(409, "TRAINING_TARGET_UNAVAILABLE");

    const cueValue = cue || null;
    const existing = await tx.habit.findFirst({
      where: { userId, archivedAt: null, title, action, cue: cueValue },
      select: { id: true, title: true }
    });
    if (!existing && await tx.habit.count({ where: { userId, archivedAt: null } }) >= MAX_ACTIVE_HABITS) {
      throw new ApiError(409, "HABIT_QUOTA_EXCEEDED");
    }
    const habit = existing ?? await tx.habit.create({
      data: { userId, title, action, cue: cueValue },
      select: { id: true, title: true }
    });
    await tx.habitAssociation.createMany({
      data: [{ habitId: habit.id, constructCode, hypothesis: `Logic training focus: ${focus}`, evidenceLevel: "user_selected" }],
      skipDuplicates: true
    });
    return habit;
  });
}
