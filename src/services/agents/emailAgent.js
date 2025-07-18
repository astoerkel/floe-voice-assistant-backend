const { Tool } = require('langchain/tools');
const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');

class EmailAgent {
  constructor() {
    this.agentName = 'email';
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
      logger.info(`Email agent processing command for user ${userId}:`, {
        input: input.substring(0, 100)
      });

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
      const emails = await this.getEmails(userId, intent.filter, limit);
      
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
  async getEmails(userId, filter = 'all', limit = 10) {
    try {
      // For now, return mock data. In a real implementation, this would:
      // 1. Check user's Gmail integration
      // 2. Fetch emails from Gmail API
      // 3. Apply filters and return formatted emails
      
      const mockEmails = [
        {
          id: 'email1',
          subject: 'Team Meeting Tomorrow',
          sender: 'john@company.com',
          senderName: 'John Smith',
          body: 'Hi team, reminder about our meeting tomorrow at 2 PM in the conference room.',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          isRead: false,
          isImportant: true
        },
        {
          id: 'email2',
          subject: 'Project Update',
          sender: 'jane@company.com',
          senderName: 'Jane Doe',
          body: 'Here is the latest update on the project status...',
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
          isRead: false,
          isImportant: false
        },
        {
          id: 'email3',
          subject: 'Weekly Report',
          sender: 'manager@company.com',
          senderName: 'Manager',
          body: 'Please find the weekly report attached.',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          isRead: true,
          isImportant: false
        }
      ];
      
      let filteredEmails = mockEmails;
      
      switch (filter) {
        case 'unread':
          filteredEmails = mockEmails.filter(email => !email.isRead);
          break;
        case 'important':
          filteredEmails = mockEmails.filter(email => email.isImportant);
          break;
        case 'recent':
          filteredEmails = mockEmails.filter(email => 
            email.timestamp > new Date(Date.now() - 6 * 60 * 60 * 1000) // Last 6 hours
          );
          break;
        default:
          filteredEmails = mockEmails;
      }
      
      return filteredEmails.slice(0, limit);
    } catch (error) {
      logger.error('Get emails failed:', error);
      return [];
    }
  }

  async sendEmail(emailData) {
    try {
      // For now, return mock data. In a real implementation, this would:
      // 1. Validate email data
      // 2. Send email via Gmail API
      // 3. Store sent email reference
      // 4. Return confirmation
      
      const mockEmail = {
        id: `email_${Date.now()}`,
        recipient: emailData.recipient,
        subject: emailData.subject,
        body: emailData.body || 'Sent via voice assistant',
        timestamp: new Date(),
        userId: emailData.userId,
        status: 'sent'
      };
      
      logger.info('Email sent:', mockEmail);
      return mockEmail;
    } catch (error) {
      logger.error('Send email failed:', error);
      throw error;
    }
  }

  async replyToEmail(emailId, replyText) {
    try {
      // Mock implementation
      const mockReply = {
        id: `reply_${Date.now()}`,
        originalEmailId: emailId,
        body: replyText,
        timestamp: new Date(),
        status: 'sent'
      };
      
      logger.info('Email reply sent:', mockReply);
      return mockReply;
    } catch (error) {
      logger.error('Reply to email failed:', error);
      throw error;
    }
  }

  async markEmailRead(emailId) {
    try {
      // Mock implementation
      logger.info('Email marked as read:', emailId);
      return { id: emailId, isRead: true };
    } catch (error) {
      logger.error('Mark email read failed:', error);
      throw error;
    }
  }

  async searchEmails(userId, query, limit = 10) {
    try {
      // Mock implementation - search in mock emails
      const mockEmails = await this.getEmails(userId, 'all', 50);
      
      const searchResults = mockEmails.filter(email => 
        email.subject.toLowerCase().includes(query.toLowerCase()) ||
        email.body.toLowerCase().includes(query.toLowerCase()) ||
        email.senderName.toLowerCase().includes(query.toLowerCase())
      );
      
      return searchResults.slice(0, limit);
    } catch (error) {
      logger.error('Search emails failed:', error);
      return [];
    }
  }

  // Utility methods
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