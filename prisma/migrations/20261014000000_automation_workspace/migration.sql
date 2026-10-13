CREATE TABLE "AutomationAccount" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomationAccount_username_key" ON "AutomationAccount"("username");
CREATE TABLE "AutomationWorkspace" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "AutomationWorkspace_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AutomationWorkspace_ownerId_updatedAt_idx" ON "AutomationWorkspace"("ownerId", "updatedAt");
