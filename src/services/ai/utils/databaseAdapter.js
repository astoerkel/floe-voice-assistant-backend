const logger = require('../../../utils/logger');

/**
 * Database adapter that can work with both Prisma and raw PostgreSQL pool
 * This allows the enhanced coordinator to work in both development (Prisma) 
 * and production (raw pg pool) environments
 */
class DatabaseAdapter {
  constructor(dbConfig) {
    // Check if we have Prisma
    if (dbConfig && dbConfig.prisma) {
      this.isPrisma = true;
      this.db = dbConfig.prisma;
      logger.info('Database adapter initialized with Prisma');
    } 
    // Check if we have a raw pool
    else if (dbConfig && (dbConfig.pool || dbConfig.query)) {
      this.isPrisma = false;
      this.db = dbConfig.pool || dbConfig;
      logger.info('Database adapter initialized with PostgreSQL pool');
    } 
    else {
      logger.warn('Database adapter initialized without database connection');
      this.isPrisma = false;
      this.db = null;
    }
  }

  /**
   * Log a conversation interaction
   */
  async logConversation(data) {
    if (!this.db) {
      logger.warn('Cannot log conversation - no database connection');
      return;
    }

    try {
      if (this.isPrisma) {
        // Prisma approach
        return await this.db.conversationLog.create({
          data: {
            userId: data.userId,
            userInput: data.userInput,
            assistantResponse: data.assistantResponse,
            intent: data.intent || 'general',
            confidence: data.confidence || 1.0,
            metadata: data.metadata || {}
          }
        });
      } else {
        // Raw SQL approach
        const query = `
          INSERT INTO "ConversationLog" 
          ("userId", "userInput", "assistantResponse", "intent", "confidence", "metadata", "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING *
        `;
        
        const values = [
          data.userId,
          data.userInput,
          data.assistantResponse,
          data.intent || 'general',
          data.confidence || 1.0,
          JSON.stringify(data.metadata || {})
        ];

        const result = await this.db.query(query, values);
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Failed to log conversation:', error);
      throw error;
    }
  }

  /**
   * Get conversation history for a user
   */
  async getConversationHistory(userId, limit = 10) {
    if (!this.db) {
      logger.warn('Cannot get conversation history - no database connection');
      return [];
    }

    try {
      if (this.isPrisma) {
        // Prisma approach
        const history = await this.db.conversationLog.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: limit
        });
        return history.reverse();
      } else {
        // Raw SQL approach
        const query = `
          SELECT * FROM "ConversationLog"
          WHERE "userId" = $1
          ORDER BY "createdAt" DESC
          LIMIT $2
        `;
        
        const result = await this.db.query(query, [userId, limit]);
        return result.rows.reverse();
      }
    } catch (error) {
      logger.error('Failed to get conversation history:', error);
      return [];
    }
  }

  /**
   * Update user usage count
   */
  async updateUserUsage(userId, increment = 1) {
    if (!this.db) {
      logger.warn('Cannot update user usage - no database connection');
      return;
    }

    try {
      if (this.isPrisma) {
        // Prisma approach
        return await this.db.user.update({
          where: { id: userId },
          data: {
            monthlyUsageCount: { increment },
            totalCommandsUsed: { increment }
          }
        });
      } else {
        // Raw SQL approach
        const query = `
          UPDATE "User"
          SET "monthlyUsageCount" = "monthlyUsageCount" + $2,
              "totalCommandsUsed" = "totalCommandsUsed" + $2,
              "updatedAt" = NOW()
          WHERE id = $1
          RETURNING *
        `;
        
        const result = await this.db.query(query, [userId, increment]);
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Failed to update user usage:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    if (!this.db) {
      logger.warn('Cannot get user - no database connection');
      return null;
    }

    try {
      if (this.isPrisma) {
        // Prisma approach
        return await this.db.user.findUnique({
          where: { id: userId }
        });
      } else {
        // Raw SQL approach
        const query = 'SELECT * FROM "User" WHERE id = $1';
        const result = await this.db.query(query, [userId]);
        return result.rows[0] || null;
      }
    } catch (error) {
      logger.error('Failed to get user:', error);
      return null;
    }
  }

  /**
   * Check if database is connected
   */
  async isConnected() {
    if (!this.db) return false;

    try {
      if (this.isPrisma) {
        // Try a simple query with Prisma
        await this.db.$queryRaw`SELECT 1`;
        return true;
      } else {
        // Try a simple query with pool
        await this.db.query('SELECT 1');
        return true;
      }
    } catch (error) {
      logger.error('Database connection check failed:', error);
      return false;
    }
  }
}

module.exports = DatabaseAdapter;