-- Additive Rehearse domain migration. Existing LifeOps tables are intentionally preserved.
CREATE TABLE "RehearseProposal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "routine" JSONB NOT NULL,
  "microTwin" JSONB NOT NULL,
  "context" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RehearseProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RehearseSimulation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "proposalVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "violations" JSONB NOT NULL,
  "trace" JSONB NOT NULL,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RehearseSimulation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RehearseActivation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "proposalVersion" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "snapshot" JSONB NOT NULL,
  "runtimeState" JSONB NOT NULL,
  "idempotencyKey" TEXT,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rolledBackAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RehearseActivation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RehearseAuditEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "proposalId" TEXT,
  "activationId" TEXT,
  "type" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RehearseAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RehearseProposal_userId_status_createdAt_idx" ON "RehearseProposal"("userId", "status", "createdAt");
CREATE INDEX "RehearseSimulation_userId_proposalId_createdAt_idx" ON "RehearseSimulation"("userId", "proposalId", "createdAt");
CREATE UNIQUE INDEX "RehearseActivation_userId_idempotencyKey_key" ON "RehearseActivation"("userId", "idempotencyKey");
CREATE INDEX "RehearseActivation_userId_proposalId_status_idx" ON "RehearseActivation"("userId", "proposalId", "status");
CREATE INDEX "RehearseAuditEvent_userId_proposalId_createdAt_idx" ON "RehearseAuditEvent"("userId", "proposalId", "createdAt");

ALTER TABLE "RehearseProposal" ADD CONSTRAINT "RehearseProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RehearseSimulation" ADD CONSTRAINT "RehearseSimulation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RehearseSimulation" ADD CONSTRAINT "RehearseSimulation_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "RehearseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RehearseActivation" ADD CONSTRAINT "RehearseActivation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RehearseActivation" ADD CONSTRAINT "RehearseActivation_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "RehearseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RehearseAuditEvent" ADD CONSTRAINT "RehearseAuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RehearseAuditEvent" ADD CONSTRAINT "RehearseAuditEvent_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "RehearseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RehearseAuditEvent" ADD CONSTRAINT "RehearseAuditEvent_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "RehearseActivation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
