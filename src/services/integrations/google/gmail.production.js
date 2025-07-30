const { google } = require('googleapis');
const db = require('../../../config/databasePool');
const logger = require('../../../utils/logger');
const GoogleOAuthService = require('../../oauth/googleOAuth.production');

class GmailIntegrationProduction {
  constructor() {
    this.serviceName = 'google';
    this.googleOAuthService = new GoogleOAuthService();
  }

  async getEmails(userId, options = {}) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const gmail = google.gmail({ version: 'v1', auth });

      // Default query
      const query = options.query || 'in:inbox is:unread';
      const maxResults = options.maxResults || 10;

      // List messages
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults
      });

      if (!listResponse.data.messages || listResponse.data.messages.length === 0) {
        return [];
      }

      // Get full details for each message
      const emails = await Promise.all(
        listResponse.data.messages.map(async (message) => {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });

          return this.parseEmail(detail.data);
        })
      );

      return emails;
    } catch (error) {
      logger.error('Gmail API error:', error);
      if (error.code === 401) {
        throw new Error('Google authentication expired. Please reconnect.');
      }
      throw error;
    }
  }

  parseEmail(emailData) {
    const headers = emailData.payload.headers;
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

    // Extract body
    let body = '';
    const extractBody = (parts) => {
      if (!parts) return '';
      
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body.data) {
          return Buffer.from(part.body.data, 'base64').toString();
        }
        if (part.parts) {
          const nestedBody = extractBody(part.parts);
          if (nestedBody) return nestedBody;
        }
      }
      return '';
    };

    if (emailData.payload.body?.data) {
      body = Buffer.from(emailData.payload.body.data, 'base64').toString();
    } else if (emailData.payload.parts) {
      body = extractBody(emailData.payload.parts);
    }

    return {
      id: emailData.id,
      threadId: emailData.threadId,
      subject: getHeader('Subject'),
      sender: getHeader('From'),
      recipient: getHeader('To'),
      date: getHeader('Date'),
      snippet: emailData.snippet,
      body: body.substring(0, 1000), // Limit body length
      labelIds: emailData.labelIds || [],
      isRead: !emailData.labelIds?.includes('UNREAD'),
      isImportant: emailData.labelIds?.includes('IMPORTANT'),
      timestamp: new Date(parseInt(emailData.internalDate))
    };
  }

  async sendEmail(userId, emailData) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const gmail = google.gmail({ version: 'v1', auth });

      // Create email
      const email = [
        `To: ${emailData.to}`,
        `Subject: ${emailData.subject}`,
        '',
        emailData.body
      ].join('\n');

      const encodedEmail = Buffer.from(email).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedEmail
        }
      });

      return { success: true, id: result.data.id, threadId: result.data.threadId };
    } catch (error) {
      logger.error('Gmail send error:', error);
      throw error;
    }
  }

  async searchEmails(userId, searchQuery, limit = 10) {
    return this.getEmails(userId, { query: searchQuery, maxResults: limit });
  }

  async getUnreadEmails(userId, limit = 10) {
    return this.getEmails(userId, { query: 'is:unread', maxResults: limit });
  }

  async getImportantEmails(userId, limit = 10) {
    return this.getEmails(userId, { query: 'is:important', maxResults: limit });
  }

  async replyToEmail(userId, messageId, replyText) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const gmail = google.gmail({ version: 'v1', auth });

      // Get the original message
      const originalMessage = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const originalEmail = this.parseEmail(originalMessage.data);
      
      // Create reply
      const replyData = {
        to: originalEmail.sender,
        subject: originalEmail.subject.startsWith('Re:') ? originalEmail.subject : `Re: ${originalEmail.subject}`,
        body: replyText
      };

      const message = this.createEmailMessage(replyData);

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message,
          threadId: originalMessage.data.threadId
        }
      });

      return {
        success: true,
        id: response.data.id,
        threadId: response.data.threadId
      };
    } catch (error) {
      logger.error('Failed to reply to email:', error);
      throw error;
    }
  }

  async markAsRead(userId, messageId) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const gmail = google.gmail({ version: 'v1', auth });

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to mark email as read:', error);
      throw error;
    }
  }

  async markAsUnread(userId, messageId) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const gmail = google.gmail({ version: 'v1', auth });

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: ['UNREAD']
        }
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to mark email as unread:', error);
      throw error;
    }
  }

  async deleteEmail(userId, messageId) {
    try {
      const auth = await this.googleOAuthService.getAuthenticatedClient(userId);
      const gmail = google.gmail({ version: 'v1', auth });

      await gmail.users.messages.delete({
        userId: 'me',
        id: messageId
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete email:', error);
      throw error;
    }
  }

  createEmailMessage(emailData) {
    const lines = [];
    
    if (emailData.to) lines.push(`To: ${emailData.to}`);
    if (emailData.cc) lines.push(`Cc: ${emailData.cc}`);
    if (emailData.bcc) lines.push(`Bcc: ${emailData.bcc}`);
    if (emailData.subject) lines.push(`Subject: ${emailData.subject}`);
    
    lines.push(''); // Empty line to separate headers from body
    lines.push(emailData.body || '');
    
    const message = lines.join('\n');
    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  }

  async isIntegrationActive(userId) {
    try {
      const result = await db.query(
        'SELECT google_services_connected FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0 || !result.rows[0].google_services_connected) {
        logger.info(`Gmail integration not active for user ${userId}`);
        return false;
      }

      // Try to get authenticated client to verify tokens work
      try {
        await this.googleOAuthService.getAuthenticatedClient(userId);
        logger.info(`Gmail integration verified active for user ${userId}`);
        return true;
      } catch (error) {
        logger.error(`Gmail integration token validation failed for user ${userId}:`, error.message);
        // Mark as inactive if tokens don't work
        await db.query(
          'UPDATE users SET google_services_connected = false WHERE id = $1',
          [userId]
        );
        return false;
      }
    } catch (error) {
      logger.error('Failed to check integration status:', error);
      return false;
    }
  }

  getStats() {
    return {
      serviceName: this.serviceName,
      isConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      supportedOperations: [
        'getEmails',
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

module.exports = GmailIntegrationProduction;