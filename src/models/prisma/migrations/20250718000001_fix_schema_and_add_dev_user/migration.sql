-- Add missing columns to voice_commands table
DO $$ 
BEGIN
    -- Add transcriptionMethod column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'transcriptionMethod') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "transcriptionMethod" TEXT NOT NULL DEFAULT 'apple_speech';
    END IF;
    
    -- Add other missing columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'intent') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "intent" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'agentUsed') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "agentUsed" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'response') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "response" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'responseAudio') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "responseAudio" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'responseAudioUrl') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "responseAudioUrl" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'status') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'executionTime') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "executionTime" INTEGER;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'platform') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'ios';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'error') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "error" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'completedAt') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "completedAt" TIMESTAMP(3);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'metadata') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "metadata" JSONB;
    END IF;
END $$;

-- Create development user for testing
INSERT INTO "users" ("id", "email", "name", "createdAt", "updatedAt", "lastActive", "isActive", "role")
VALUES ('dev-user-123', 'dev@example.com', 'Development User', NOW(), NOW(), NOW(), true, 'user')
ON CONFLICT ("id") DO NOTHING;

-- Also create by email in case ID conflicts
INSERT INTO "users" ("id", "email", "name", "createdAt", "updatedAt", "lastActive", "isActive", "role")
VALUES ('dev-user-email-123', 'dev@voiceassistant.com', 'Development User Alt', NOW(), NOW(), NOW(), true, 'user')
ON CONFLICT ("email") DO NOTHING;