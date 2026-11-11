-- Add optional user-reported automaticity and opt-in AI classification.
-- Notes are private user content and are never part of public catalog or logs.
CREATE TYPE "HabitAIStatus" AS ENUM ('DISABLED','PENDING','PROCESSING','COMPLETED','FAILED');
ALTER TABLE "Habit" ADD COLUMN "reviewEnabled" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "HabitReflection" (
  "id" UUID NOT NULL,
  "habitId" UUID NOT NULL,
  "eventId" UUID,
  "note" VARCHAR(600),
  "initiationLevel" INTEGER,
  "aiConsent" BOOLEAN NOT NULL DEFAULT false,
  "aiStatus" "HabitAIStatus" NOT NULL DEFAULT 'DISABLED',
  "aiLevel" INTEGER,
  "aiConfidence" DOUBLE PRECISION,
  "aiQuote" VARCHAR(180),
  "aiModelId" VARCHAR(100),
  "aiPromptVersion" VARCHAR(60),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HabitReflection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HabitReflection_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HabitReflection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HabitEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HabitReflection_initiationLevel_check" CHECK ("initiationLevel" IS NULL OR "initiationLevel" BETWEEN 0 AND 4),
  CONSTRAINT "HabitReflection_aiLevel_check" CHECK ("aiLevel" IS NULL OR "aiLevel" BETWEEN 0 AND 4),
  CONSTRAINT "HabitReflection_aiConfidence_check" CHECK ("aiConfidence" IS NULL OR "aiConfidence" BETWEEN 0 AND 1)
);
CREATE UNIQUE INDEX "HabitReflection_eventId_key" ON "HabitReflection"("eventId");
CREATE INDEX "HabitReflection_habitId_createdAt_idx" ON "HabitReflection"("habitId","createdAt");
CREATE INDEX "HabitReflection_aiStatus_createdAt_idx" ON "HabitReflection"("aiStatus","createdAt");
