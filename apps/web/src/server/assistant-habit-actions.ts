import type { Prisma } from "@/generated/prisma/client";
import { calculateHabitProgress } from "@stepmark/core";
import {
  observationDay,
  verifiedInitiationEvidence,
  type SafeAssistantCommand
} from "./assistant-command";
import {
  habitSelfRatingEvidence,
  MAX_ACTIVE_HABITS,
  readHabitOpportunityCounts,
  recentHabitSelfRatings
} from "./habit-service";
import { ApiError } from "./security";

export type AssistantHabitResult = {
  reply: string;
  change: null | {
    kind: "habit_created" | "opportunity_recorded" | "reflection_recorded";
    habitId: string;
    habitTitle: string;
  };
  progress: null | {
    habitId: string;
    percent: number;
    repetitions: number;
    evidenceStale: boolean;
  };
};

type HabitAction = {
  tx: Prisma.TransactionClient;
  userId: string;
  localDate: string;
  command: SafeAssistantCommand;
  message: string;
  model: string;
};

export async function executeAssistantHabitAction(action: HabitAction): Promise<AssistantHabitResult | null> {
  const { command } = action;
  if (command.intent === "create_habit") return createHabit(action);
  if (!command.target) return null;

  switch (command.intent) {
    case "record_opportunity":
      return recordOpportunity(action, command.target.id);
    case "record_reflection":
      return recordReflection(action, command.target.id);
    case "check_progress":
      return checkProgress(action, command.target.id);
    default:
      return null;
  }
}

async function createHabit({ tx, userId, command }: HabitAction): Promise<AssistantHabitResult> {
  const count = await tx.habit.count({ where: { userId, archivedAt: null } });
  if (count >= MAX_ACTIVE_HABITS) throw new ApiError(409, "HABIT_QUOTA_EXCEEDED");

  const existing = await tx.habit.findFirst({
    where: {
      userId,
      archivedAt: null,
      title: command.title!,
      action: command.action!,
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }
    },
    select: { id: true, title: true }
  });
  const created = existing ?? await tx.habit.create({
    data: { userId, title: command.title!, action: command.action!, cue: command.cue },
    select: { id: true, title: true }
  });
  return {
    reply: existing
      ? "相同的习惯近期已经建立，没有重复创建。"
      : `已为你建立「${created.title}」。以后直接和我说执行情况，我会记录到你的账户中。`,
    change: { kind: "habit_created", habitId: created.id, habitTitle: created.title },
    progress: null
  };
}

async function findActiveHabit(tx: Prisma.TransactionClient, userId: string, habitId: string) {
  const habit = await tx.habit.findFirst({
    where: { id: habitId, userId, archivedAt: null },
    select: { id: true, title: true }
  });
  if (!habit) throw new ApiError(404, "HABIT_NOT_FOUND");
  return habit;
}

async function recordOpportunity(
  { tx, userId, command, localDate, message, model }: HabitAction,
  habitId: string
): Promise<AssistantHabitResult> {
  const habit = await findActiveHabit(tx, userId, habitId);
  const day = observationDay(localDate, command.when);
  const eligible = command.status !== "no_cue";
  const completed = command.status === "done";
  const opportunityKey = "daily:" + day;
  const where = { habitId_opportunityKey: { habitId: habit.id, opportunityKey } };
  const existing = await tx.habitEvent.findUnique({ where });

  if (existing && (existing.completed !== completed || existing.eligible !== eligible)) {
    return {
      reply: `${day} 的「${habit.title}」已有不同状态。为了避免覆盖记录，请在习惯详情中使用“更正”并查看审计历史。`,
      change: null,
      progress: null
    };
  }

  if (!existing) {
    await tx.habitEvent.create({
      data: {
        habitId: habit.id,
        opportunityKey,
        eligible,
        completed,
        occurredAt: day === localDate ? new Date() : new Date(day + "T12:00:00.000Z"),
        source: "assistant"
      }
    });
  }

  const evidence = completed ? verifiedInitiationEvidence(command, message) : null;
  let change: AssistantHabitResult["change"] = existing
    ? null
    : { kind: "opportunity_recorded", habitId: habit.id, habitTitle: habit.title };
  if (evidence && (!existing || !(await tx.habitReflection.findUnique({
    where: { eventId: existing.id },
    select: { id: true }
  })))) {
    const eventId = existing?.id || (await tx.habitEvent.findUniqueOrThrow({
      where,
      select: { id: true }
    })).id;
    await tx.habitReflection.create({
      data: {
        habitId: habit.id,
        eventId,
        ...assistantReflectionData(message, model, evidence)
      }
    });
    change = { kind: "reflection_recorded", habitId: habit.id, habitTitle: habit.title };
  }

  const state = completed ? "已执行" : eligible ? "有机会但未执行" : "没有出现触发情境";
  return {
    reply: `已记录「${habit.title}」在 ${day} 的状态：${state}。这是行为记录，不会直接改变能力分数。`,
    change,
    progress: null
  };
}

async function recordReflection(
  { tx, userId, command, localDate, message, model }: HabitAction,
  habitId: string
): Promise<AssistantHabitResult> {
  const habit = await findActiveHabit(tx, userId, habitId);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const count = await tx.habitReflection.count({
    where: { habitId: habit.id, createdAt: { gte: start } }
  });
  if (count >= 2) throw new ApiError(429, "REFLECTION_DAILY_LIMIT");

  // A generic reflection has no known occurrence day.
  const day = command.when ? observationDay(localDate, command.when) : null;
  const event = day ? await tx.habitEvent.findUnique({
    where: { habitId_opportunityKey: { habitId: habit.id, opportunityKey: "daily:" + day } },
    select: { id: true, completed: true }
  }) : null;
  const existingReflection = event?.completed ? await tx.habitReflection.findUnique({
    where: { eventId: event.id },
    select: { id: true }
  }) : null;
  const evidence = verifiedInitiationEvidence(command, message);

  await tx.habitReflection.create({
    data: {
      habitId: habit.id,
      eventId: event?.completed && !existingReflection ? event.id : null,
      ...assistantReflectionData(message, model, evidence)
    }
  });

  const linkage = day
    ? (event?.completed ? "已核对对应日期的完成记录。" : "该日期没有对应的完成记录，感受没有强行关联事件。")
    : "没有明确日期，感受不会自动绑定今天的完成记录。";
  const reply = evidence
    ? `已记录「${habit.title}」的感受。AI 根据你的原话暂定自然启动等级 ${evidence.level}/4；这只是待校验的解释，不是你亲自选择的评分。`
    : `已保存「${habit.title}」的原话感受。由于缺少明确依据，AI 没有擅自给出自然启动评分。`;
  return {
    reply: reply + linkage,
    change: { kind: "reflection_recorded", habitId: habit.id, habitTitle: habit.title },
    progress: null
  };
}

function assistantReflectionData(
  message: string,
  model: string,
  evidence: ReturnType<typeof verifiedInitiationEvidence>
) {
  return {
    note: message.slice(0, 600),
    initiationLevel: null,
    aiConsent: true,
    aiStatus: "COMPLETED" as const,
    aiLevel: evidence?.level ?? null,
    aiConfidence: evidence?.confidence ?? null,
    aiQuote: evidence?.quote ?? null,
    aiModelId: model.slice(0, 100),
    aiPromptVersion: "conversation-intent-v1",
    reviewedAt: new Date()
  };
}

async function checkProgress({ tx, userId }: HabitAction, habitId: string): Promise<AssistantHabitResult> {
  const habit = await tx.habit.findFirst({
    where: { id: habitId, userId, archivedAt: null },
    select: { id: true, title: true, reviewEnabled: true }
  });
  if (!habit) throw new ApiError(404, "HABIT_NOT_FOUND");

  const [counts, notes] = await Promise.all([
    readHabitOpportunityCounts(tx, [habit.id]),
    // Filter before applying the limit so AI-only entries cannot evict self-ratings.
    tx.habitReflection.findMany({
      ...recentHabitSelfRatings,
      where: { habitId: habit.id, ...recentHabitSelfRatings.where }
    })
  ]);
  const { completed, eligible, lastCompletedAtMs, recentOpportunities } = counts.get(habit.id)!;
  const status = calculateHabitProgress({
    completedRepetitions: completed,
    eligibleOpportunities: eligible,
    completedOpportunities: completed,
    observations: habitSelfRatingEvidence(notes),
    nowMs: Date.now(),
    lastCompletedAtMs,
    recentOpportunities,
    seed: habit.id,
    reviewEnabled: habit.reviewEnabled
  });
  const execution = status.observedCompletionRate === null
    ? "暂无已记录的执行机会。"
    : `已记录 ${status.eligibleOpportunities} 次执行机会，完成 ${completed} 次（${Math.round(status.observedCompletionRate * 100)}%）。`;
  const feedback = status.evidenceCount === 0
    ? "自然启动程度暂无本人自评。"
    : `自然启动程度有 ${status.evidenceCount} 天的本人自评。`;
  const freshness = status.evidenceCount > 0 && status.evidenceStale
    ? "最近的感受证据已过时，建议简短复查。"
    : "";
  const consistency = status.recentExecution?.inconsistent
    ? "近期多次有机会但未执行，先核对触发情境是否合适。"
    : "";

  return {
    reply: `「${habit.title}」${execution}${feedback}${freshness}${consistency}`,
    change: null,
    progress: {
      habitId: habit.id,
      percent: status.progress,
      repetitions: completed,
      evidenceStale: status.evidenceStale
    }
  };
}
