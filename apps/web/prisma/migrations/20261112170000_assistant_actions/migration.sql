-- Chat command idempotency stores no raw conversation content.
CREATE TABLE "AssistantAction" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "messageDigest" VARCHAR(64) NOT NULL,
  "intent" VARCHAR(40) NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssistantAction_userId_requestId_key"
  ON "AssistantAction"("userId","requestId");
CREATE INDEX "AssistantAction_userId_createdAt_idx"
  ON "AssistantAction"("userId","createdAt");
ALTER TABLE "AssistantAction"
  ADD CONSTRAINT "AssistantAction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
