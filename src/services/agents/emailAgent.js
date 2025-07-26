const { Tool } = require('langchain/tools');
const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');
const GmailIntegration = require('../integrations/google/gmail');

class EmailAgent {
  constructor() {
    this.agentName = 'email';
    this.gmailService = new GmailIntegration();
    this.tools = this.createTools();
  }

  createTools() {
    return [
      new Tool({
        name: 'get_emails',
        description: 'Get emails from inbox with optional filters',
        func: async (input) => {
          try {
            const { userId, filter, limit } = JSON.parse(input);
            return await this.getEmails(userId, filter, limit);
          } catch (error) {
            logger.error('Get emails tool error:', error);
            return `Error getting emails: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'send_email',
        description: 'Send a new email',
        func: async (input) => {
          try {
            const emailData = JSON.parse(input);
            return await this.sendEmail(emailData);
          } catch (error) {
            logger.error('Send email tool error:', error);
            return `Error sending email: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'reply_to_email',
        description: 'Reply to an existing email',
        func: async (input) => {
          try {
            const { emailId, replyText } = JSON.parse(input);
            return await this.replyToEmail(emailId, replyText);
          } catch (error) {
            logger.error('Reply to email tool error:', error);
            return `Error replying to email: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'mark_email_read',
        description: 'Mark an email as read',
        func: async (input) => {
          try {
            const { emailId } = JSON.parse(input);
            return await this.markEmailRead(emailId);
          } catch (error) {
            logger.error('Mark email read tool error:', error);
            return `Error marking email as read: ${error.message}`;
          }
        }
      }),
      new Tool({
        name: 'search_emails',
        description: 'Search emails by keywords',
        func: async (input) => {
          try {
            const { userId, query, limit } = JSON.parse(input);
            return await this.searchEmails(userId, query, limit);
          } catch (error) {
            logger.error('Search emails tool error:', error);
            return `Error searching emails: ${error.message}`;
          }
        }
      })
    ];
  }

  async processCommand(userId, input, context = {}) {
    try {
      logger.info(`🔧 Legacy EmailAgent processing command for user ${userId}:`, {
        input: input.substring(0, 100),
        integrations: context?.integrations
      });

      // Check if Gmail integration is active from iOS app context first
      const isActiveFromContext = context?.integrations?.google?.connected === true;
      
      // Only check database if context doesn't provide integration status
      let isActive = isActiveFromContext;
      if (!context?.integrations) {
        isActive = await this.gmailService.isIntegrationActive(userId);
      }
      
      logger.info(`🔧 Legacy EmailAgent OAuth check - context: ${JSON.stringify(context?.integrations)}, isActive: ${isActive}`);
      
      if (!isActive) {
        return {
          text: "I'd be happy to help with your emails, but you'll need to connect your Gmail account first. Would you like me to guide you through setting that up?",
          actions: [],
          suggestions: ['Connect Gmail account', 'Check integration status', 'Try again later']
        };
      }

      // Parse the intent and extract relevant information
      const intent = await this.parseEmailIntent(input);
      
      let response;
      switch (intent.type) {
        case 'get_emails':
          response = await this.handleGetEmails(userId, intent, context);
          break;
        case 'send_email':
          response = await this.handleSendEmail(userId, intent, context);
          break;
        case 'reply_email':
          response = await this.handleReplyEmail(userId, intent, context);
          break;
        case 'search_emails':
          response = await this.handleSearchEmails(userId, intent, context);
          break;
        case 'mark_read':
          response = await this.handleMarkRead(userId, intent, context);
          break;
        default:
          response = await this.handleGeneralEmailQuery(userId, input, context);
      }

      logger.info(`Email agent completed processing for user ${userId}`);
      return response;
    } catch (error) {
      logger.error('Email agent processing failed:', error);
      return {
        text: "I'm having trouble with your email request. Could you please try again?",
        actions: [],
        suggestions: ['Check your emails', 'Send an email', 'Search emails']
      };
    }
  }

  async parseEmailIntent(input) {
    const lowerInput = input.toLowerCase();
    
    // Get emails patterns
    if (lowerInput.includes('show') || lowerInput.includes('check') || lowerInput.includes('read')) {
      if (lowerInput.includes('unread')) {
        return { type: 'get_emails', filter: 'unread' };
      } else if (lowerInput.includes('important')) {
        return { type: 'get_emails', filter: 'important' };
      } else if (lowerInput.includes('recent')) {
        return { type: 'get_emails', filter: 'recent' };
      } else {
        return { type: 'get_emails', filter: 'all' };
      }
    }
    
    // Send email patterns
    if (lowerInput.includes('send') || lowerInput.includes('compose') || lowerInput.includes('write')) {
      return { type: 'send_email', input };
    }
    
    // Reply email patterns
    if (lowerInput.includes('reply') || lowerInput.includes('respond')) {
      return { type: 'reply_email', input };
    }
    
    // Search email patterns
    if (lowerInput.includes('search') || lowerInput.includes('find')) {
      return { type: 'search_emails', input };
    }
    
    // Mark as read patterns
    if (lowerInput.includes('mark') && lowerInput.includes('read')) {
      return { type: 'mark_read', input };
    }
    
    return { type: 'general', input };
  }

  async handleGetEmails(userId, intent, context) {
    try {
      const limit = intent.filter === 'recent' ? 5 : 10;
      const emails = await this.getEmails(userId, intent.filter, limit, context);
      
      // Check if Google isn't connected
      if (emails.notConnected) {
        return {
          text: "I can see your Google account is connected, but I'm having trouble accessing your emails. Let me check your connection status.",
          actions: [],
          suggestions: ['Check connection status', 'Try again', 'Reconnect Google']
        };
      }
      
      if (emails.length === 0) {
        const filterText = intent.filter === 'unread' ? 'unread emails' : 
                          intent.filter === 'important' ? 'important emails' : 'emails';
        return {
          text: `You have no ${filterText}.`,
          actions: [],
          suggestions: ['Send an email', 'Search emails', 'Check different folder']
        };
      }
      
      const emailList = emails.map(email => 
        `${email.subject} from ${email.sender}`
      ).join(', ');
      
      const filterText = intent.filter === 'unread' ? 'unread emails' : 
                        intent.filter === 'important' ? 'important emails' : 'recent emails';
      
      return {
        text: `Here are your ${filterText}: ${emailList}`,
        actions: emails.map(email => ({
          type: 'view_email',
          emailId: email.id,
          subject: email.subject
        })),
        suggestions: ['Read email', 'Reply to email', 'Search emails']
      };
    } catch (error) {
      logger.error('Handle get emails failed:', error);
      return {
        text: "I couldn't retrieve your emails. Please try again.",
        actions: [],
        suggestions: ['Try again', 'Check connection']
      };
    }
  }

  async handleSendEmail(userId, intent, context) {
    try {
      // Parse email details from input
      const emailDetails = await this.parseEmailDetails(intent.input);
      
      if (!emailDetails.recipient || !emailDetails.subject) {
        return {
          text: "I need more information to send this email. Please provide a recipient and subject.",
          actions: [],
          suggestions: ['Try: "Send an email to John about the meeting"']
        };
      }
      
      const email = await this.sendEmail({
        userId,
        ...emailDetails
      });
      
      return {
        text: `I've sent an email to ${email.recipient} with the subject "${email.subject}".`,
        actions: [{
          type: 'view_sent_email',
          emailId: email.id,
          subject: email.subject
        }],
        suggestions: ['Send another email', 'Check inbox', 'View sent emails']
      };
    } catch (error) {
      logger.error('Handle send email failed:', error);
      return {
        text: "I couldn't send the email. Please try again with more details.",
        actions: [],
        suggestions: ['Try: "Send an email to John about the meeting"']
      };
    }
  }

  async handleReplyEmail(userId, intent, context) {
    try {
      return {
        text: "To reply to an email, please first show me your emails and then specify which one you'd like to reply to.",
        actions: [],
        suggestions: ['Show my emails', 'Check unread emails', 'Be more specific']
      };
    } catch (error) {
      logger.error('Handle reply email failed:', error);
      return {
        text: "I couldn't reply to the email. Please try again.",
        actions: [],
        suggestions: ['Show emails first', 'Try again']
      };
    }
  }

  async handleSearchEmails(userId, intent, context) {
    try {
      const searchQuery = this.extractSearchQuery(intent.input);
      
      if (!searchQuery) {
        return {
          text: "What would you like to search for in your emails?",
          actions: [],
          suggestions: ['Search for sender', 'Search for subject', 'Search for keywords']
        };
      }
      
      const emails = await this.searchEmails(userId, searchQuery, 10);
      
      if (emails.length === 0) {
        return {
          text: `I couldn't find any emails matching "${searchQuery}".`,
          actions: [],
          suggestions: ['Try different keywords', 'Check all emails', 'Search with different terms']
        };
      }
      
      const emailList = emails.map(email => 
        `${email.subject} from ${email.sender}`
      ).join(', ');
      
      return {
        text: `I found ${emails.length} emails matching "${searchQuery}": ${emailList}`,
        actions: emails.map(email => ({
          type: 'view_email',
          emailId: email.id,
          subject: email.subject
        })),
        suggestions: ['Read email', 'Refine search', 'Search for something else']
      };
    } catch (error) {
      logger.error('Handle search emails failed:', error);
      return {
        text: "I couldn't search your emails. Please try again.",
        actions: [],
        suggestions: ['Try again', 'Check connection']
      };
    }
  }

  async handleMarkRead(userId, intent, context) {
    try {
      return {
        text: "To mark an email as read, please first show me your emails and then specify which one you'd like to mark as read.",
        actions: [],
        suggestions: ['Show unread emails', 'Check all emails', 'Be more specific']
      };
    } catch (error) {
      logger.error('Handle mark read failed:', error);
      return {
        text: "I couldn't mark the email as read. Please try again.",
        actions: [],
        suggestions: ['Show emails first', 'Try again']
      };
    }
  }

  async handleGeneralEmailQuery(userId, input, context) {
    return {
      text: "I can help you with your emails. You can ask me to check your inbox, send emails, reply to messages, or search through your emails.",
      actions: [],
      suggestions: ['Check unread emails', 'Send an email', 'Search emails']
    };
  }

  // Email data management methods
  async getEmails(userId, filter = 'all', limit = 10, context = {}) {
    try {
      // Check if Gmail integration is active from iOS app context first
      const isActiveFromContext = context?.integrations?.google?.connected === true;
      
      // Only check database if context doesn't provide integration status
      let isActive = isActiveFromContext;
      if (!context?.integrations) {
        isActive = await this.gmailService.isIntegrationActive(userId);
      }
      
      if (!isActive) {
        logger.warn(`Gmail integration not active for user ${userId} (context: ${isActiveFromContext}, db check: ${!context?.integrations})`);
        // Return a special indicator that Google isn't connected
        return { notConnected: true };
      }

      let query = '';
      switch (filter) {
        case 'unread':
          query = 'is:unread';
          break;
        case 'important':
          query = 'is:important';
          break;
        case 'recent':
          // Get emails from last 6 hours
          const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
          const dateFilter = sixHoursAgo.toISOString().split('T')[0].replace(/-/g, '/');
          query = `after:${dateFilter}`;
          break;
        default:
          query = '';
      }
      
      const emails = await this.gmailService.getEmails(userId, {
        query,
        limit,
        includeSpamTrash: false
      });
      
      // Transform Gmail format to agent format for backwards compatibility
      return emails.map(email => ({
        id: email.id,
        subject: email.subject || '(No Subject)',
        sender: email.sender || 'Unknown Sender',
        senderName: this.extractSenderName(email.sender),
        body: email.body || email.snippet || '',
        timestamp: email.timestamp,
        isRead: email.isRead,
        isImportant: email.isImportant,
        snippet: email.snippet
      }));
    } catch (error) {
      logger.error('Get emails failed:', error);
      // Return empty array on error instead of mock data
      return [];
    }
  }

  async sendEmail(emailData) {
    try {
      // Check if Gmail integration is active
      const isActive = await this.gmailService.isIntegrationActive(emailData.userId);
      if (!isActive) {
        throw new Error('Gmail integration not active for user');
      }

      const result = await this.gmailService.sendEmail(emailData.userId, {
        to: emailData.recipient,
        subject: emailData.subject,
        body: emailData.body || 'Sent via voice assistant'
      });
      
      logger.info('Email sent via Gmail API:', result);
      return {
        id: result.id,
        recipient: emailData.recipient,
        subject: emailData.subject,
        body: emailData.body || 'Sent via voice assistant',
        timestamp: new Date(),
        userId: emailData.userId,
        status: 'sent'
      };
    } catch (error) {
      logger.error('Send email failed:', error);
      throw error;
    }
  }

  async replyToEmail(userId, emailId, replyText) {
    try {
      // Check if Gmail integration is active
      const isActive = await this.gmailService.isIntegrationActive(userId);
      if (!isActive) {
        throw new Error('Gmail integration not active for user');
      }

      const result = await this.gmailService.replyToEmail(userId, emailId, replyText);
      
      logger.info('Email reply sent via Gmail API:', result);
      return {
        id: result.id,
        originalEmailId: emailId,
        body: replyText,
        timestamp: new Date(),
        status: 'sent'
      };
    } catch (error) {
      logger.error('Reply to email failed:', error);
      throw error;
    }
  }

  async markEmailRead(userId, emailId) {
    try {
      // Check if Gmail integration is active
      const isActive = await this.gmailService.isIntegrationActive(userId);
      if (!isActive) {
        throw new Error('Gmail integration not active for user');
      }

      const result = await this.gmailService.markAsRead(userId, emailId);
      
      logger.info('Email marked as read via Gmail API:', emailId);
      return { id: emailId, isRead: true, success: result.success };
    } catch (error) {
      logger.error('Mark email read failed:', error);
      throw error;
    }
  }

  async searchEmails(userId, query, limit = 10) {
    try {
      // Check if Gmail integration is active
      const isActive = await this.gmailService.isIntegrationActive(userId);
      if (!isActive) {
        logger.warn(`Gmail integration not active for user ${userId}`);
        return [];
      }

      const emails = await this.gmailService.searchEmails(userId, query, limit);
      
      // Transform Gmail format to agent format for backwards compatibility
      return emails.map(email => ({
        id: email.id,
        subject: email.subject || '(No Subject)',
        sender: email.sender || 'Unknown Sender',
        senderName: this.extractSenderName(email.sender),
        body: email.body || email.snippet || '',
        timestamp: email.timestamp,
        isRead: email.isRead,
        isImportant: email.isImportant,
        snippet: email.snippet
      }));
    } catch (error) {
      logger.error('Search emails failed:', error);
      return [];
    }
  }

  // Utility methods
  extractSenderName(senderString) {
    if (!senderString) return 'Unknown Sender';
    
    // Extract name from "Name <email@domain.com>" format
    const nameMatch = senderString.match(/^([^<]+)<.+>$/);
    if (nameMatch) {
      return nameMatch[1].trim();
    }
    
    // If no name part, return email address
    return senderString;
  }

  parseEmailDetails(input) {
    // Simple parsing - in a real implementation, this would use NLP
    const emailDetails = {
      recipient: null,
      subject: null,
      body: null
    };
    
    // Extract recipient
    if (input.includes('to ')) {
      const match = input.match(/to ([^about]+)/i);
      if (match) {
        emailDetails.recipient = match[1].trim();
      }
    }
    
    // Extract subject
    if (input.includes('about ')) {
      const match = input.match(/about (.+)/i);
      if (match) {
        emailDetails.subject = match[1].trim();
      }
    }
    
    // Extract body (if specified)
    if (input.includes('saying ')) {
      const match = input.match(/saying (.+)/i);
      if (match) {
        emailDetails.body = match[1].trim();
      }
    }
    
    return emailDetails;
  }

  extractSearchQuery(input) {
    // Extract search query from input
    const patterns = [
      /search for (.+)/i,
      /find (.+)/i,
      /look for (.+)/i,
      /emails about (.+)/i,
      /emails from (.+)/i
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return null;
  }

  formatEmailSummary(email) {
    const timeAgo = this.getTimeAgo(email.timestamp);
    return `${email.subject} from ${email.senderName} (${timeAgo})`;
  }

  getTimeAgo(timestamp) {
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  getStats() {
    return {
      agentName: this.agentName,
      toolsAvailable: this.tools.length,
      lastProcessedAt: new Date().toISOString()
    };
  }
}

module.exports = new EmailAgent();