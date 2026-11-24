CREATE TABLE "GrowthPractice" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "dimension" VARCHAR(24) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "question" VARCHAR(600) NOT NULL,
  "nextAction" VARCHAR(500) NOT NULL,
  "successCriteria" VARCHAR(500) NOT NULL,
  "evidence" VARCHAR(1500) NOT NULL DEFAULT '',
  "reflection" VARCHAR(1000) NOT NULL DEFAULT '',
  "nextQuestion" VARCHAR(600) NOT NULL DEFAULT '',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "GrowthPractice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GrowthPractice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GrowthPractice_userId_requestId_key"
  ON "GrowthPractice" ("userId", "requestId");
CREATE INDEX "GrowthPractice_userId_createdAt_id_idx"
  ON "GrowthPractice" ("userId", "createdAt", "id");
