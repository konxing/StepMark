import type { Prisma } from "@/generated/prisma/client";
import { WORK_EVIDENCE_RUBRIC, type groundedWorkEvidence } from "./work-evidence";

export async function saveAssistantWorkEvidence(
  tx: Prisma.TransactionClient,
  userId: string,
  reportDay: string,
  model: string,
  evidence: ReturnType<typeof groundedWorkEvidence>
): Promise<number> {
  // Serialize this owner's writes so an action cannot be recorded under two domains.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR NO KEY UPDATE`;
  const existing = await tx.workEvidence.findMany({
    where: { userId, digest: { in: evidence.map((row) => row.digest) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, digest: true, stage: true, rubric: true }
  });
  const modelId = model.slice(0, 100);
  let changed = 0;
  for (const row of evidence) {
    const match = existing.find((item) => item.digest === row.digest);
    if (!match) {
      await tx.workEvidence.create({
        data: { ...row, userId, reportDay, modelId, rubric: WORK_EVIDENCE_RUBRIC }
      });
      changed++;
      continue;
    }

    if (!row.outcomeQuote || (match.stage === 2 && match.rubric === WORK_EVIDENCE_RUBRIC)) continue;
    const enriched = await tx.workEvidence.updateMany({
      where: { id: match.id, userId },
      data: { stage: 2, outcomeQuote: row.outcomeQuote, modelId, rubric: WORK_EVIDENCE_RUBRIC }
    });
    changed += enriched.count;
  }
  return changed;
}
