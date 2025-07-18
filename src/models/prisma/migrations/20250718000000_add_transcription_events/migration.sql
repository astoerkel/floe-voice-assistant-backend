-- CreateTable
CREATE TABLE "transcription_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "processingTime" INTEGER,
    "audioLength" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcription_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transcription_events_userId_createdAt_idx" ON "transcription_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "transcription_events_method_platform_idx" ON "transcription_events"("method", "platform");

-- AddForeignKey
ALTER TABLE "transcription_events" ADD CONSTRAINT "transcription_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add text column to voice_commands if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'text') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "text" TEXT;
    END IF;
END $$;