-- Add all remaining missing columns to voice_commands table
DO $$ 
BEGIN
    -- Add conversationId column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'conversationId') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "conversationId" TEXT;
    END IF;
    
    -- Add transcription column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'transcription') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "transcription" TEXT;
    END IF;
    
    -- Add audioUrl column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'audioUrl') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "audioUrl" TEXT;
    END IF;
    
    -- Add audioSize column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'audioSize') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "audioSize" INTEGER;
    END IF;
    
    -- Add audioFormat column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'audioFormat') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "audioFormat" TEXT;
    END IF;
    
    -- Add createdAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'createdAt') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Add updatedAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_commands' AND column_name = 'updatedAt') THEN
        ALTER TABLE "voice_commands" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Ensure the voice_commands table has the correct foreign key constraint
DO $$
BEGIN
    -- Check if foreign key constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'voice_commands_userId_fkey' 
        AND table_name = 'voice_commands'
    ) THEN
        ALTER TABLE "voice_commands" 
        ADD CONSTRAINT "voice_commands_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;