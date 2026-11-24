CREATE TABLE "WorkEvidence" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "domain" VARCHAR(30) NOT NULL,
  "stage" INTEGER NOT NULL,
  "actionQuote" VARCHAR(180) NOT NULL,
  "outcomeQuote" VARCHAR(180),
  "digest" VARCHAR(64) NOT NULL,
  "reportDay" VARCHAR(10) NOT NULL,
  "modelId" VARCHAR(100) NOT NULL,
  "rubric" VARCHAR(40) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkEvidence_stage_check" CHECK (
    ("stage" = 1 AND "outcomeQuote" IS NULL) OR ("stage" = 2 AND "outcomeQuote" IS NOT NULL)
  ),
  CONSTRAINT "WorkEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkEvidence_userId_domain_digest_key" ON "WorkEvidence"("userId", "domain", "digest");
CREATE INDEX "WorkEvidence_userId_reportDay_idx" ON "WorkEvidence"("userId", "reportDay");
CREATE INDEX "WorkEvidence_userId_createdAt_id_idx" ON "WorkEvidence"("userId", "createdAt", "id");
