-- A given task form may be counted as evidence only once per user.
-- Repeated measurement requires a NEW task form; changing this requires an ADR.
CREATE UNIQUE INDEX "AssessmentAttempt_userId_taskId_key" ON "AssessmentAttempt"("userId","taskId");
