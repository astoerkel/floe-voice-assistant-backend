#!/usr/bin/env node

/**
 * Database Migration Script for LangChain Coordinator
 * Adds new models and schema updates for the LangChain coordinator system
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting LangChain Coordinator database migration...');

  try {
    // 1. Add preferred_name column to users table if it doesn't exist
    console.log('📝 Adding preferred_name column to users table...');
    await prisma.$executeRaw`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS preferred_name VARCHAR(50);
    `;

    // 2. Update existing users with their name as default preferred name
    console.log('👤 Setting default preferred names for existing users...');
    await prisma.$executeRaw`
      UPDATE users 
      SET preferred_name = name 
      WHERE preferred_name IS NULL AND name IS NOT NULL;
    `;

    // 3. Create ConversationLog table for analytics
    console.log('💬 Creating ConversationLog table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "ConversationLog" (
        id VARCHAR(30) PRIMARY KEY DEFAULT 'clog_' || substr(md5(random()::text), 1, 25),
        "userId" VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        input TEXT NOT NULL,
        intent VARCHAR(100),
        agent VARCHAR(50),
        response TEXT,
        "processingTime" INTEGER,
        success BOOLEAN DEFAULT true,
        "sessionId" VARCHAR(100),
        platform VARCHAR(20),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 4. Create ConversationContext table for session management
    console.log('🧠 Creating ConversationContext table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "ConversationContext" (
        id VARCHAR(30) PRIMARY KEY DEFAULT 'ctx_' || substr(md5(random()::text), 1, 26),
        "userId" VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "sessionId" VARCHAR(100) NOT NULL,
        context JSONB NOT NULL DEFAULT '{}',
        state VARCHAR(50) DEFAULT 'active',
        "lastActivity" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
        UNIQUE("userId", "sessionId")
      );
    `;

    // 5. Create UserPreferences table for personalization
    console.log('⚙️ Creating UserPreferences table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "UserPreferences" (
        id VARCHAR(30) PRIMARY KEY DEFAULT 'pref_' || substr(md5(random()::text), 1, 25),
        "userId" VARCHAR(30) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        "responseLength" VARCHAR(20) DEFAULT 'medium',
        "communicationStyle" VARCHAR(20) DEFAULT 'friendly',
        "enthusiasm" INTEGER DEFAULT 5 CHECK (enthusiasm >= 1 AND enthusiasm <= 10),
        "workSchedule" JSONB DEFAULT '{"timezone": "UTC", "workingHours": {"start": "09:00", "end": "17:00"}}',
        preferences JSONB DEFAULT '{}',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 6. Create UserLearningData table for ML
    console.log('🤖 Creating UserLearningData table...');
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "UserLearningData" (
        id VARCHAR(30) PRIMARY KEY DEFAULT 'learn_' || substr(md5(random()::text), 1, 24),
        "userId" VARCHAR(30) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "interactionType" VARCHAR(50) NOT NULL,
        "userSatisfaction" INTEGER CHECK ("userSatisfaction" >= 1 AND "userSatisfaction" <= 5),
        "responseTime" INTEGER,
        context JSONB DEFAULT '{}',
        patterns JSONB DEFAULT '{}',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 7. Create indexes for performance
    console.log('📊 Creating indexes for performance...');
    
    // ConversationLog indexes
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "ConversationLog_userId_createdAt_idx" 
      ON "ConversationLog"("userId", "createdAt" DESC);
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "ConversationLog_sessionId_idx" 
      ON "ConversationLog"("sessionId");
    `;

    // ConversationContext indexes
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "ConversationContext_userId_lastActivity_idx" 
      ON "ConversationContext"("userId", "lastActivity" DESC);
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "ConversationContext_expiresAt_idx" 
      ON "ConversationContext"("expiresAt");
    `;

    // UserLearningData indexes
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "UserLearningData_userId_createdAt_idx" 
      ON "UserLearningData"("userId", "createdAt" DESC);
    `;

    // 8. Create trigger to update UserPreferences.updatedAt
    console.log('⏰ Creating update triggers...');
    
    // Create the function first
    await prisma.$executeRaw`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."updatedAt" = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `;

    // Drop existing trigger if it exists
    await prisma.$executeRaw`
      DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON "UserPreferences";
    `;

    // Create the new trigger
    await prisma.$executeRaw`
      CREATE TRIGGER update_user_preferences_updated_at
        BEFORE UPDATE ON "UserPreferences"
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `;

    // 9. Create cleanup function for expired contexts
    console.log('🧹 Creating cleanup function...');
    await prisma.$executeRaw`
      CREATE OR REPLACE FUNCTION cleanup_expired_contexts()
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        DELETE FROM "ConversationContext" WHERE "expiresAt" < CURRENT_TIMESTAMP;
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;
    `;

    // 10. Verify migration by checking table existence
    console.log('🔍 Verifying migration...');
    
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('ConversationLog', 'ConversationContext', 'UserPreferences', 'UserLearningData')
      ORDER BY table_name;
    `;

    console.log('✅ Migration completed successfully!');
    console.log('📋 Created tables:', tables.map(t => t.table_name).join(', '));

    // 11. Show table counts
    const counts = {
      users: await prisma.user.count(),
      conversationLogs: await prisma.$queryRaw`SELECT COUNT(*) as count FROM "ConversationLog"`,
      conversationContexts: await prisma.$queryRaw`SELECT COUNT(*) as count FROM "ConversationContext"`,
      userPreferences: await prisma.$queryRaw`SELECT COUNT(*) as count FROM "UserPreferences"`,
      userLearningData: await prisma.$queryRaw`SELECT COUNT(*) as count FROM "UserLearningData"`
    };

    console.log('\n📊 Current table counts:');
    console.log(`  Users: ${counts.users}`);
    console.log(`  ConversationLog: ${counts.conversationLogs[0].count}`);
    console.log(`  ConversationContext: ${counts.conversationContexts[0].count}`);
    console.log(`  UserPreferences: ${counts.userPreferences[0].count}`);
    console.log(`  UserLearningData: ${counts.userLearningData[0].count}`);

    console.log('\n🎉 LangChain Coordinator database migration completed successfully!');
    console.log('💡 You can now start using the new LangChain coordinator system.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error('❌ Migration script failed:', e);
    process.exit(1);
  });