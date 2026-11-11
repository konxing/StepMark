-- Keep the current opportunity state for efficient aggregates, while preserving
-- an append-only, cascade-deleted record of each explicit user correction.
ALTER TABLE "HabitEvent" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "HabitEventCorrection" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousEligible" BOOLEAN NOT NULL,
  "previousCompleted" BOOLEAN NOT NULL,
  "updatedEligible" BOOLEAN NOT NULL,
  "updatedCompleted" BOOLEAN NOT NULL,
  "source" VARCHAR(30) NOT NULL,
  "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HabitEventCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HabitEventCorrection_eventId_fkey" FOREIGN KEY ("eventId")
    REFERENCES "HabitEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HabitEventCorrection_before_valid" CHECK ("previousEligible" OR NOT "previousCompleted"),
  CONSTRAINT "HabitEventCorrection_after_valid" CHECK ("updatedEligible" OR NOT "updatedCompleted")
);
CREATE UNIQUE INDEX "HabitEventCorrection_eventId_revision_key"
  ON "HabitEventCorrection"("eventId","revision");
CREATE INDEX "HabitEventCorrection_eventId_correctedAt_idx"
  ON "HabitEventCorrection"("eventId","correctedAt");
