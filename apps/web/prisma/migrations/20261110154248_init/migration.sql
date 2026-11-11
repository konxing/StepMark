-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('LOCAL', 'WECHAT', 'AICHAT');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('OBJECTIVE', 'RUBRIC', 'SELF_REPORT', 'AI_ASSISTED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PROVISIONAL', 'REVIEWED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailTokenPurpose" AS ENUM ('VERIFY', 'RESET');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('WEB', 'WECHAT');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" UUID NOT NULL,
    "credentialId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "purpose" "EmailTokenPurpose" NOT NULL DEFAULT 'VERIFY',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" VARCHAR(160) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "LoginCode" (
    "codeHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("codeHash")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "providerSubject" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "SessionKind" NOT NULL DEFAULT 'WEB',
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Construct" (
    "code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "Construct_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "constructCode" VARCHAR(100) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "rubricVersion" VARCHAR(50),
    "content" JSONB NOT NULL,
    "calibration" JSONB,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "taskVersion" VARCHAR(50) NOT NULL,
    "evidenceKind" "EvidenceKind" NOT NULL,
    "rawScore" DOUBLE PRECISION,
    "evidence" JSONB NOT NULL,
    "deviceInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIJudgement" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "modelId" VARCHAR(100) NOT NULL,
    "promptVersion" VARCHAR(100) NOT NULL,
    "rubricVersion" VARCHAR(100) NOT NULL,
    "evidence" JSONB NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PROVISIONAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIJudgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbilityEstimate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "constructCode" VARCHAR(100) NOT NULL,
    "estimator" VARCHAR(100) NOT NULL,
    "modelVersion" VARCHAR(50) NOT NULL,
    "estimate" DOUBLE PRECISION NOT NULL,
    "standardError" DOUBLE PRECISION,
    "evidenceCount" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbilityEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "cue" VARCHAR(250),
    "action" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitEvent" (
    "id" UUID NOT NULL,
    "habitId" UUID NOT NULL,
    "opportunityKey" VARCHAR(100) NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomaticityCheck" (
    "id" UUID NOT NULL,
    "habitId" UUID NOT NULL,
    "instrumentVersion" VARCHAR(40) NOT NULL,
    "responses" JSONB NOT NULL,
    "indexScore" DOUBLE PRECISION NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomaticityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitAssociation" (
    "habitId" UUID NOT NULL,
    "constructCode" VARCHAR(100) NOT NULL,
    "hypothesis" VARCHAR(500) NOT NULL,
    "evidenceLevel" VARCHAR(40) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitAssociation_pkey" PRIMARY KEY ("habitId","constructCode")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Credential_userId_key" ON "Credential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_email_key" ON "Credential"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_credentialId_expiresAt_idx" ON "VerificationToken"("credentialId", "expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginCode_expiresAt_idx" ON "LoginCode"("expiresAt");

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_providerSubject_key" ON "ExternalIdentity"("provider", "providerSubject");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Construct_version_idx" ON "Construct"("version");

-- CreateIndex
CREATE INDEX "Task_constructCode_publishedAt_idx" ON "Task"("constructCode", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Task_id_version_key" ON "Task"("id", "version");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_userId_createdAt_idx" ON "AssessmentAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_taskId_createdAt_idx" ON "AssessmentAttempt"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AIJudgement_attemptId_createdAt_idx" ON "AIJudgement"("attemptId", "createdAt");

-- CreateIndex
CREATE INDEX "AbilityEstimate_userId_constructCode_calculatedAt_idx" ON "AbilityEstimate"("userId", "constructCode", "calculatedAt");

-- CreateIndex
CREATE INDEX "Habit_userId_archivedAt_createdAt_idx" ON "Habit"("userId", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "HabitEvent_habitId_occurredAt_idx" ON "HabitEvent"("habitId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "HabitEvent_habitId_opportunityKey_key" ON "HabitEvent"("habitId", "opportunityKey");

-- CreateIndex
CREATE INDEX "AutomaticityCheck_habitId_measuredAt_idx" ON "AutomaticityCheck"("habitId", "measuredAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_constructCode_fkey" FOREIGN KEY ("constructCode") REFERENCES "Construct"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJudgement" ADD CONSTRAINT "AIJudgement_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbilityEstimate" ADD CONSTRAINT "AbilityEstimate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbilityEstimate" ADD CONSTRAINT "AbilityEstimate_constructCode_fkey" FOREIGN KEY ("constructCode") REFERENCES "Construct"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitEvent" ADD CONSTRAINT "HabitEvent_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomaticityCheck" ADD CONSTRAINT "AutomaticityCheck_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitAssociation" ADD CONSTRAINT "HabitAssociation_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitAssociation" ADD CONSTRAINT "HabitAssociation_constructCode_fkey" FOREIGN KEY ("constructCode") REFERENCES "Construct"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
