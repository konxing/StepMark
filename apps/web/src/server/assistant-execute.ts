import type { Prisma } from "@/generated/prisma/client";
import {
  assistantMessageDigest,
  validateClientLocalDate,
  type SafeAssistantCommand
} from "./assistant-command";
import { executeAssistantHabitAction, type AssistantHabitResult } from "./assistant-habit-actions";
import { getDb } from "./db";
import { ApiError } from "./security";
import type { groundedWorkEvidence } from "./work-evidence";
import { saveAssistantWorkEvidence } from "./work-evidence-store";

export type AssistantResult = AssistantHabitResult & {
  workEvidenceAdded?: number;
};

type AssistantExecution = {
  userId: string;
  requestId: string;
  message: string;
  localDate: string;
  command: SafeAssistantCommand;
  model: string;
  workEvidence?: ReturnType<typeof groundedWorkEvidence>;
};

async function readReceipt(
  db: Pick<Prisma.TransactionClient, "assistantAction">,
  where: Prisma.AssistantActionWhereUniqueInput,
  messageDigest: string
): Promise<AssistantResult | undefined> {
  const receipt = await db.assistantAction.findUnique({
    where,
    select: { messageDigest: true, result: true }
  });
  if (!receipt) return undefined;
  if (receipt.messageDigest !== messageDigest) throw new ApiError(409, "ASSISTANT_REQUEST_ID_REUSED");
  return receipt.result as AssistantResult;
}

export async function executeAssistantCommand(args: AssistantExecution): Promise<AssistantResult> {
  const { userId, requestId, message, command, model, workEvidence = [] } = args;
  const localDate = validateClientLocalDate(args.localDate);
  const hasWorkEvidence = workEvidence.length > 0;

  // Ordinary replies have no durable receipt unless the message records work evidence.
  if ((command.intent === "chat" || command.intent === "clarify") && !hasWorkEvidence) {
    return {
      reply: (command.reply || "我没有改动任何记录。").slice(0, 500),
      change: null,
      progress: null
    };
  }

  const messageDigest = assistantMessageDigest(message);
  const db = getDb();
  const where = { userId_requestId: { userId, requestId } };
  const old = await readReceipt(db, where, messageDigest);
  if (old !== undefined) return old;

  // The mutation and its replay receipt commit together.
  try {
    return await db.$transaction(async (tx) => {
      const previous = await readReceipt(tx, where, messageDigest);
      if (previous !== undefined) return previous;

      const fallback = command.intent === "clarify"
        ? "请再说具体一点，我不会在不确定时修改记录。"
        : "我理解了。";
      const result: AssistantResult = (await executeAssistantHabitAction({
        tx,
        userId,
        localDate,
        command,
        message,
        model
      })) ?? { reply: (command.reply || fallback).slice(0, 500), change: null, progress: null };

      if (hasWorkEvidence) {
        result.workEvidenceAdded = await saveAssistantWorkEvidence(tx, userId, localDate, model, workEvidence);
      }
      if (command.intent !== "check_progress" || hasWorkEvidence) {
        const receipt = hasWorkEvidence && !result.change && !result.progress
          ? { ...result, reply: "这条消息已处理。" }
          : result;
        await tx.assistantAction.create({
          data: {
            userId,
            requestId,
            messageDigest,
            intent: command.intent,
            result: JSON.parse(JSON.stringify(receipt)) as Prisma.InputJsonValue
          }
        });
      }
      return result;
    });
  } catch (error) {
    // A competing request may commit its receipt while this transaction rolls back.
    const recorded = await readReceipt(db, where, messageDigest);
    if (recorded !== undefined) return recorded;
    throw error;
  }
}
