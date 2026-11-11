-- Deliberately separate training evidence from official AssessmentAttempt/Task.
-- User deletion cascades; independent retest scores never use practice rows.
CREATE TABLE "PracticeAttempt" (
 "id" UUID NOT NULL,
 "userId" UUID NOT NULL,
 "itemId" VARCHAR(64) NOT NULL,
 "bankVersion" VARCHAR(40) NOT NULL,
 "selectedKey" VARCHAR(4) NOT NULL,
 "correct" BOOLEAN NOT NULL,
 "dayKey" VARCHAR(10) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PracticeAttempt_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PracticeAttempt_userId_itemId_dayKey_key" ON "PracticeAttempt"("userId","itemId","dayKey");
CREATE INDEX "PracticeAttempt_userId_createdAt_idx" ON "PracticeAttempt"("userId","createdAt");
CREATE INDEX "PracticeAttempt_userId_itemId_createdAt_idx" ON "PracticeAttempt"("userId","itemId","createdAt");
