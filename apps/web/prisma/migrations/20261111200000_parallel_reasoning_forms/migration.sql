-- Nullable form metadata allows the original one-shot demonstration tasks to remain unchanged.
ALTER TABLE "Task"
  ADD COLUMN "formCode" VARCHAR(50),
  ADD COLUMN "skillCode" VARCHAR(50),
  ADD COLUMN "formOrder" INTEGER;
CREATE UNIQUE INDEX "Task_formCode_formOrder_key" ON "Task"("formCode", "formOrder");
CREATE INDEX "Task_constructCode_formCode_publishedAt_idx"
  ON "Task"("constructCode", "formCode", "publishedAt");
ALTER TABLE "Task" ADD CONSTRAINT "Task_formOrder_positive"
  CHECK ("formOrder" IS NULL OR "formOrder" > 0);
