-- Existing records did not preserve whether a hint had been viewed;
-- NULL is deliberately NOT a claim of unassisted recall.
ALTER TABLE "PracticeAttempt" ADD COLUMN "hintUsed" BOOLEAN;
