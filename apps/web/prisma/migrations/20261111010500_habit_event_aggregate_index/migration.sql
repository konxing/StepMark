-- Support index-only scans for per-habit eligible/completed opportunity counts.
CREATE INDEX "HabitEvent_habitId_eligible_completed_idx" ON "HabitEvent"("habitId", "eligible", "completed");
