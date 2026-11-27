import { Prisma } from "@/generated/prisma/client";
import { getDb } from "./db";

export const logicTrainingConstruct = "reasoning.logic";

/** Count completed opportunities from the later of the baseline and habit link, up to retest start. */
export async function readLogicTrainingCounts(
  habitIds: readonly string[],
  baselineAt: string | null,
  endAt: Date
): Promise<Map<string, number>> {
  if (!habitIds.length || !baselineAt) return new Map();
  const ids = Prisma.join(habitIds.map((id) => Prisma.sql`${id}::uuid`));
  const baseline = new Date(baselineAt);
  const rows = await getDb().$queryRaw<{ habitId: string; completed: number }[]>`
    SELECT association."habitId", COUNT(event.id)::int AS completed
    FROM "HabitAssociation" AS association
    LEFT JOIN "HabitEvent" AS event
      ON event."habitId" = association."habitId"
      AND event.eligible AND event.completed
      AND event."occurredAt" > GREATEST(association."updatedAt", ${baseline})
      AND event."occurredAt" < ${endAt}
    WHERE association."habitId" IN (${ids})
      AND association."constructCode" = ${logicTrainingConstruct}
      AND GREATEST(association."updatedAt", ${baseline}) < ${endAt}
    GROUP BY association."habitId"
  `;
  return new Map(rows.map(({ habitId, completed }) => [habitId, completed]));
}
