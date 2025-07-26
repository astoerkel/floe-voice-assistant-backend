const { google } = require('googleapis');
const { prisma } = require('../../../config/database');
const logger = require('../../../utils/logger');

class GmailIntegration {
  constructor() {
    this.serviceName = 'google'; // Changed from 'gmail' to 'google' to match OAuth integration type
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    this.gmail = google.gmail({
      version: 'v1',
      auth: this.oauth2Client
    });
  }

  async setupIntegration(userId, authCode) {
    try {
      // Exchange authorization code for tokens
      const { tokens } = await this.oauth2Client.getToken(authCode);
      
      // Store tokens in database
      await prisma.integration.upsert({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        },
        update: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          isActive: true,
          metadata: {
            scope: tokens.scope,
            tokenType: tokens.token_type
          }
        },
        create: {
          userId,
          type: this.serviceName,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          isActive: true,
          metadata: {
            scope: tokens.scope,
            tokenType: tokens.token_type
          }
        }
      });

      logger.info(`Gmail integration setup for user ${userId}`);
      return { success: true, message: 'Gmail integration configured successfully' };
    } catch (error) {
      logger.error('Gmail integration setup failed:', error);
      return { success: false, error: error.message };
    }
  }

  async getAuthUrl(userId) {
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ];

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: userId // Include user ID in state for security
    });

    return authUrl;
  }

  async getAccessToken(userId) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        }
      });

      if (!integration || !integration.isActive) {
        throw new Error('Gmail integration not found or inactive');
      }

      if (!integration.accessToken) {
        throw new Error('No access token available for Gmail integration');
      }

      // Check if token needs refresh
      if (integration.expiresAt && new Date() >= integration.expiresAt) {
        logger.info(`Token expired for user ${userId}, refreshing...`);
        try {
          await this.refreshToken(userId, integration);
          // Fetch updated integration after refresh
          const refreshedIntegration = await prisma.integration.findUnique({
            where: {
              userId_type: {
                userId,
                type: this.serviceName
              }
            }
          });
          
          if (!refreshedIntegration || !refreshedIntegration.accessToken) {
            throw new Error('Failed to refresh token');
          }
          
          this.oauth2Client.setCredentials({
            access_token: refreshedIntegration.accessToken,
            refresh_token: refreshedIntegration.refreshToken
          });
          
          return refreshedIntegration.accessToken;
        } catch (refreshError) {
          logger.error('Token refresh failed:', refreshError);
          // Mark integration as inactive if refresh fails
          await prisma.integration.update({
            where: {
              userId_type: {
                userId,
                type: this.serviceName
              }
            },
            data: {
              isActive: false,
              syncErrors: {
                lastError: refreshError.message,
                timestamp: new Date().toISOString()
              }
            }
          });
          throw new Error('Gmail integration token expired and could not be refreshed. Please re-authenticate.');
        }
      }

      this.oauth2Client.setCredentials({
        access_token: integration.accessToken,
        refresh_token: integration.refreshToken
      });

      return integration.accessToken;
    } catch (error) {
      logger.error('Failed to get access token:', error);
      throw error;
    }
  }

  async refreshToken(userId, integration) {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: integration.refreshToken
      });

      const { tokens } = await this.oauth2Client.refreshAccessToken();

      // Update tokens in database
      await prisma.integration.update({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        },
        data: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || integration.refreshToken,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null
        }
      });

      logger.info(`Refreshed Gmail token for user ${userId}`);
    } catch (error) {
      logger.error('Failed to refresh token:', error);
      throw error;
    }
  }

  async getEmails(userId, options = {}) {
    try {
      await this.getAccessToken(userId);

      const {
        limit = 10,
        query = '',
        includeSpamTrash = false,
        labelIds = null
      } = options;

      let searchQuery = query;
      if (!includeSpamTrash) {
        searchQuery += ' -in:spam -in:trash';
      }

      // Build request parameters, only include labelIds if it's not null/undefined
      const requestParams = {
        userId: 'me',
        q: searchQuery.trim(),
        maxResults: limit
      };
      
      if (labelIds && labelIds.length > 0) {
        requestParams.labelIds = labelIds;
      }

      logger.info(`🔍 Gmail API Query for user ${userId}:`, {
        originalQuery: query,
        searchQuery: searchQuery.trim(),
        limit,
        includeSpamTrash,
        requestParams
      });

      const response = await this.gmail.users.messages.list(requestParams);

      if (!response.data.messages || response.data.messages.length === 0) {
        logger.info(`No emails found for user ${userId} with query: ${searchQuery.trim()}`);
        return [];
      }

      // Get detailed information for each message with proper error handling
      const emails = [];
      for (const message of response.data.messages) {
        try {
          const messageResponse = await this.gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });

          const parsedEmail = this.parseEmailMessage(messageResponse.data);
          emails.push(parsedEmail);
        } catch (messageError) {
          logger.warn(`Failed to get message ${message.id}:`, messageError.message);
          // Continue with other messages instead of failing completely
          continue;
        }
      }

      logger.info(`📧 Retrieved ${emails.length} emails for user ${userId}:`, {
        query: searchQuery.trim(),
        emailSummary: emails.map(email => ({
          id: email.id,
          subject: email.subject,
          sender: email.sender,
          isRead: email.isRead,
          isImportant: email.isImportant,
          timestamp: email.timestamp,
          labels: email.labels
        }))
      });
      return emails;
    } catch (error) {
      logger.error('Failed to get emails:', error);
      if (error.message.includes('token') || error.message.includes('authentication')) {
        throw new Error('Gmail authentication failed. Please reconnect your Gmail account.');
      }
      throw new Error(`Failed to retrieve emails: ${error.message}`);
    }
  }

  async getEmail(userId, messageId) {
    try {
      await this.getAccessToken(userId);

      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const email = this.parseEmailMessage(response.data);
      
      logger.info(`Retrieved email ${messageId} for user ${userId}`);
      return email;
    } catch (error) {
      logger.error('Failed to get email:', error);
      throw error;
    }
  }

  async sendEmail(userId, emailData) {
    try {
      await this.getAccessToken(userId);

      const message = this.createEmailMessage(emailData);

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message
        }
      });

      logger.info(`Sent email ${response.data.id} for user ${userId}`);
      return {
        id: response.data.id,
        threadId: response.data.threadId,
        success: true
      };
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  async replyToEmail(userId, messageId, replyText) {
    try {
      await this.getAccessToken(userId);

      // Get the original message to extract reply information
      const originalMessage = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const originalEmail = this.parseEmailMessage(originalMessage.data);
      
      // Create reply message
      const replyData = {
        to: originalEmail.sender,
        subject: originalEmail.subject.startsWith('Re:') ? originalEmail.subject : `Re: ${originalEmail.subject}`,
        body: replyText,
        inReplyTo: originalEmail.messageId,
        references: originalEmail.references || originalEmail.messageId
      };

      const message = this.createEmailMessage(replyData);

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message,
          threadId: originalMessage.data.threadId
        }
      });

      logger.info(`Sent reply ${response.data.id} for user ${userId}`);
      return {
        id: response.data.id,
        threadId: response.data.threadId,
        success: true
      };
    } catch (error) {
      logger.error('Failed to reply to email:', error);
      throw error;
    }
  }

  async markAsRead(userId, messageId) {
    try {
      await this.getAccessToken(userId);

      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });

      logger.info(`Marked email ${messageId} as read for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to mark email as read:', error);
      throw error;
    }
  }

  async markAsUnread(userId, messageId) {
    try {
      await this.getAccessToken(userId);

      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: ['UNREAD']
        }
      });

      logger.info(`Marked email ${messageId} as unread for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to mark email as unread:', error);
      throw error;
    }
  }

  async deleteEmail(userId, messageId) {
    try {
      await this.getAccessToken(userId);

      await this.gmail.users.messages.delete({
        userId: 'me',
        id: messageId
      });

      logger.info(`Deleted email ${messageId} for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete email:', error);
      throw error;
    }
  }

  async searchEmails(userId, query, limit = 10) {
    try {
      return await this.getEmails(userId, { query, limit });
    } catch (error) {
      logger.error('Failed to search emails:', error);
      throw error;
    }
  }

  async getUnreadEmails(userId, limit = 10) {
    try {
      return await this.getEmails(userId, { 
        query: 'is:unread', 
        limit 
      });
    } catch (error) {
      logger.error('Failed to get unread emails:', error);
      throw error;
    }
  }

  async getImportantEmails(userId, limit = 10) {
    try {
      return await this.getEmails(userId, { 
        query: 'is:important', 
        limit 
      });
    } catch (error) {
      logger.error('Failed to get important emails:', error);
      throw error;
    }
  }

  parseEmailMessage(message) {
    try {
      const headers = message.payload.headers || [];
      const getHeader = (name) => {
        const header = headers.find(h => h.name && h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : null;
      };

      // Extract email body with proper error handling
      let body = '';
      try {
        if (message.payload.body && message.payload.body.data) {
          // Handle URL-safe base64 encoding used by Gmail API
          const base64Data = message.payload.body.data
            .replace(/-/g, '+')
            .replace(/_/g, '/');
          body = Buffer.from(base64Data, 'base64').toString('utf8');
        } else if (message.payload.parts && Array.isArray(message.payload.parts)) {
          // Handle multipart messages
          for (const part of message.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body && part.body.data) {
              const base64Data = part.body.data
                .replace(/-/g, '+')
                .replace(/_/g, '/');
              body = Buffer.from(base64Data, 'base64').toString('utf8');
              break;
            }
            // Also check for HTML if no plain text found
            if (!body && part.mimeType === 'text/html' && part.body && part.body.data) {
              const base64Data = part.body.data
                .replace(/-/g, '+')
                .replace(/_/g, '/');
              // Extract text content from HTML (basic implementation)
              const htmlBody = Buffer.from(base64Data, 'base64').toString('utf8');
              body = htmlBody.replace(/<[^>]*>/g, '').trim();
            }
          }
        }
      } catch (bodyError) {
        logger.warn('Failed to decode email body:', bodyError.message);
        body = message.snippet || '(Body could not be decoded)';
      }

      // Ensure timestamp is valid
      let timestamp = new Date();
      try {
        if (message.internalDate) {
          timestamp = new Date(parseInt(message.internalDate));
          // Validate timestamp
          if (isNaN(timestamp.getTime()) || timestamp.getTime() < 0) {
            timestamp = new Date();
          }
        }
      } catch (timestampError) {
        logger.warn('Invalid timestamp in email:', timestampError.message);
        timestamp = new Date();
      }

      return {
        id: message.id || 'unknown',
        threadId: message.threadId || 'unknown',
        subject: getHeader('Subject') || '(No Subject)',
        sender: getHeader('From') || 'Unknown Sender',
        recipient: getHeader('To') || '',
        cc: getHeader('Cc') || '',
        bcc: getHeader('Bcc') || '',
        body: body || message.snippet || '',
        timestamp: timestamp,
        messageId: getHeader('Message-ID') || '',
        references: getHeader('References') || '',
        inReplyTo: getHeader('In-Reply-To') || '',
        isRead: !message.labelIds?.includes('UNREAD'),
        isImportant: message.labelIds?.includes('IMPORTANT'),
        labels: message.labelIds || [],
        snippet: message.snippet || ''
      };
    } catch (error) {
      logger.error('Failed to parse email message:', error);
      // Return a safe fallback object
      return {
        id: message.id || 'error',
        threadId: message.threadId || 'error',
        subject: '(Error parsing email)',
        sender: 'Unknown',
        recipient: '',
        cc: '',
        bcc: '',
        body: message.snippet || '(Error decoding email content)',
        timestamp: new Date(),
        messageId: '',
        references: '',
        inReplyTo: '',
        isRead: true,
        isImportant: false,
        labels: [],
        snippet: message.snippet || '(Error)'
      };
    }
  }

  createEmailMessage(emailData) {
    const lines = [];
    
    if (emailData.to) lines.push(`To: ${emailData.to}`);
    if (emailData.cc) lines.push(`Cc: ${emailData.cc}`);
    if (emailData.bcc) lines.push(`Bcc: ${emailData.bcc}`);
    if (emailData.subject) lines.push(`Subject: ${emailData.subject}`);
    if (emailData.inReplyTo) lines.push(`In-Reply-To: ${emailData.inReplyTo}`);
    if (emailData.references) lines.push(`References: ${emailData.references}`);
    
    lines.push(''); // Empty line to separate headers from body
    lines.push(emailData.body || '');
    
    const message = lines.join('\n');
    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  }

  async isIntegrationActive(userId) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        }
      });

      if (!integration || !integration.isActive) {
        logger.info(`Gmail integration not found or inactive for user ${userId}`);
        return false;
      }

      // Check if we have valid tokens
      if (!integration.accessToken) {
        logger.warn(`Gmail integration exists but no access token for user ${userId}`);
        return false;
      }

      // Try to get access token to verify it's working
      try {
        await this.getAccessToken(userId);
        logger.info(`Gmail integration verified active for user ${userId}`);
        return true;
      } catch (tokenError) {
        logger.error(`Gmail integration token validation failed for user ${userId}:`, tokenError.message);
        // Mark integration as inactive if token is invalid
        await prisma.integration.update({
          where: {
            userId_type: {
              userId,
              type: this.serviceName
            }
          },
          data: {
            isActive: false,
            syncErrors: {
              lastError: tokenError.message,
              timestamp: new Date().toISOString()
            }
          }
        });
        return false;
      }
    } catch (error) {
      logger.error('Failed to check integration status:', error);
      return false;
    }
  }

  async deactivateIntegration(userId) {
    try {
      await prisma.integration.update({
        where: {
          userId_type: {
            userId,
            type: this.serviceName
          }
        },
        data: {
          isActive: false
        }
      });

      logger.info(`Deactivated Gmail integration for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to deactivate integration:', error);
      return { success: false, error: error.message };
    }
  }

  getStats() {
    return {
      serviceName: this.serviceName,
      isConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      supportedOperations: [
        'getEmails',
        'getEmail',
        'sendEmail',
        'replyToEmail',
        'markAsRead',
        'markAsUnread',
        'deleteEmail',
        'searchEmails',
        'getUnreadEmails',
        'getImportantEmails'
      ]
    };
  }
}

module.exports = GmailIntegration;