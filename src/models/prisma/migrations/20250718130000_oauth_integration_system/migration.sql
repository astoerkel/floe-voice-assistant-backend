-- CreateTable
CREATE TABLE "oauth_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "returnUrl" TEXT,
    "codeVerifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "commandsThisMonth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commandsTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastCommandAt" TIMESTAMP(3),
ADD COLUMN     "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'apple',
ADD COLUMN     "providerId" TEXT,
ADD COLUMN     "subscriptionEndsAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionPlan" TEXT NOT NULL DEFAULT 'trial',
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'trial',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialStartsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "integrations" DROP COLUMN "provider",
DROP COLUMN "active",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "serviceData" JSONB,
ADD COLUMN     "syncErrors" JSONB,
ADD COLUMN     "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
ALTER COLUMN "accessToken" SET DATA TYPE TEXT,
ALTER COLUMN "refreshToken" SET DATA TYPE TEXT,
ALTER COLUMN "scope" SET DATA TYPE TEXT,
ALTER COLUMN "type" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_state_key" ON "oauth_states"("state");

-- CreateIndex
CREATE INDEX "oauth_states_state_idx" ON "oauth_states"("state");

-- CreateIndex
CREATE INDEX "oauth_states_expiresAt_idx" ON "oauth_states"("expiresAt");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_subscriptionStatus_idx" ON "users"("subscriptionStatus");

-- CreateIndex
CREATE INDEX "integrations_userId_idx" ON "integrations"("userId");

-- CreateIndex
CREATE INDEX "integrations_type_idx" ON "integrations"("type");

-- CreateIndex
CREATE INDEX "integrations_expiresAt_idx" ON "integrations"("expiresAt");

-- DropIndex
DROP INDEX "integrations_userId_provider_key";

-- CreateIndex
CREATE UNIQUE INDEX "integrations_userId_type_key" ON "integrations"("userId", "type");