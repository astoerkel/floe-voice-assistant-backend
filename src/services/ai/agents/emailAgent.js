const { ChatOpenAI } = require('@langchain/openai');
const { LLMChain } = require('langchain/chains');
const { PromptTemplate } = require('langchain/prompts');
const logger = require('../../../utils/logger');

class EmailAgent {
  constructor(emailService) {
    this.emailService = emailService;
    this.agentName = 'EmailAgent';
    
    // Initialize LLM with same configuration as coordinator
    this.llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.4, // Slightly higher for more natural email composition
      maxTokens: 1500,
      openAIApiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined,
        defaultHeaders: process.env.OPENROUTER_API_KEY ? {
          'HTTP-Referer': process.env.APP_URL || 'https://voiceassistant.com',
          'X-Title': 'Voice Assistant Email'
        } : {}
      }
    });

    logger.info('EmailAgent initialized');
  }

  /**
   * Handle email-related requests
   */
  async handleRequest(userId, userInput, context, systemPrompt) {
    try {
      logger.info(`⚡ LangChain EmailAgent handling request for user ${userId}: "${userInput}"`);
      logger.info(`⚡ LangChain EmailAgent context received: ${JSON.stringify(context, null, 2)}`);

      // Check if email integration is available from iOS app context
      // iOS sends it as 'connectedServices' in the context
      const isEmailActiveFromContext = context?.connectedServices?.google?.connected === true;
      const isEmailActiveFromIntegrations = context?.integrations?.google?.connected === true;
      
      // Also check sessionData for integrations
      const isEmailActiveFromSession = context?.sessionData?.integrations?.google?.connected === true;
      const isEmailActiveFromSessionConnected = context?.sessionData?.connectedServices?.google?.connected === true;
      
      // Only check database if context doesn't provide integration status
      let isEmailActive = isEmailActiveFromContext || isEmailActiveFromIntegrations || isEmailActiveFromSession || isEmailActiveFromSessionConnected;
      
      logger.info(`Email integration check - connectedServices: ${JSON.stringify(context?.connectedServices)}, integrations: ${JSON.stringify(context?.integrations)}, sessionData: ${JSON.stringify(context?.sessionData)}, isEmailActive: ${isEmailActive}`);
      
      if (!isEmailActive && !context?.connectedServices && !context?.integrations && !context?.sessionData?.integrations && !context?.sessionData?.connectedServices) {
        try {
          isEmailActive = await this.emailService.isIntegrationActive(userId);
        } catch (error) {
          logger.error('Failed to check email integration status:', error);
          isEmailActive = false;
        }
      }
      
      if (!isEmailActive) {
        return this.handleNoEmailIntegration(userInput);
      }

      // Analyze the email intent and extract parameters
      const emailIntent = await this.analyzeEmailIntent(userInput, context);
      
      logger.debug(`Email intent analysis:`, emailIntent);

      // Execute the appropriate email action
      let result;
      switch (emailIntent.action) {
        case 'read_emails':
          result = await this.handleReadEmails(userId, emailIntent.parameters);
          break;
        case 'send_email':
          result = await this.handleSendEmail(userId, emailIntent.parameters);
          break;
        case 'reply_email':
          result = await this.handleReplyEmail(userId, emailIntent.parameters);
          break;
        case 'search_emails':
          result = await this.handleSearchEmails(userId, emailIntent.parameters);
          break;
        case 'mark_read':
          result = await this.handleMarkRead(userId, emailIntent.parameters);
          break;
        case 'mark_unread':
          result = await this.handleMarkUnread(userId, emailIntent.parameters);
          break;
        case 'delete_email':
          result = await this.handleDeleteEmail(userId, emailIntent.parameters);
          break;
        case 'get_unread_count':
          result = await this.handleGetUnreadCount(userId, emailIntent.parameters);
          break;
        default:
          result = await this.handleGenericEmailQuery(userId, userInput, context, systemPrompt);
      }

      // Generate voice-optimized response
      const response = await this.generateResponse(userInput, result, systemPrompt, context);

      return {
        text: response,
        agentUsed: this.agentName,
        action: emailIntent.action,
        actions: result.actions || [],
        context: {
          emailAction: emailIntent.action,
          parameters: emailIntent.parameters,
          result: result.summary || 'Email operation completed'
        }
      };

    } catch (error) {
      logger.error('Error in EmailAgent:', error);
      return this.handleError(userInput, error);
    }
  }

  /**
   * Analyze email intent and extract parameters
   */
  async analyzeEmailIntent(userInput, context) {
    try {
      const intentPrompt = PromptTemplate.fromTemplate(`
        Analyze this email-related request and extract the action and parameters.

        User Input: "{input}"
        
        Context: {context}

        Available Email Actions:
        - read_emails: Read emails (unread, recent, important)
        - send_email: Send a new email
        - reply_email: Reply to an existing email
        - search_emails: Search for emails by keywords
        - mark_read: Mark email(s) as read
        - mark_unread: Mark email(s) as unread
        - delete_email: Delete an email
        - get_unread_count: Get count of unread emails

        Extract and return JSON with:
        {{
          "action": "one of the above actions",
          "confidence": 0.0-1.0,
          "parameters": {{
            "to": "recipient email address",
            "subject": "email subject",
            "body": "email body content",
            "messageId": "email ID for specific operations",
            "searchQuery": "search terms",
            "limit": "number of emails to return",
            "emailType": "unread, important, recent, all",
            "replyTo": "email to reply to",
            "replyText": "reply content",
            "senderFilter": "filter by sender"
          }}
        }}

        Only include parameters that are explicitly mentioned or can be reasonably inferred.
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: intentPrompt
      });

      const result = await chain.call({
        input: userInput,
        context: JSON.stringify(context, null, 2)
      });

      try {
        const parsed = JSON.parse(result.text);
        return {
          action: parsed.action || 'read_emails',
          confidence: parsed.confidence || 0.5,
          parameters: parsed.parameters || {}
        };
      } catch (parseError) {
        logger.warn('Failed to parse email intent, using fallback');
        return {
          action: 'read_emails',
          confidence: 0.3,
          parameters: {}
        };
      }

    } catch (error) {
      logger.error('Error analyzing email intent:', error);
      return {
        action: 'read_emails',
        confidence: 0.1,
        parameters: {}
      };
    }
  }

  /**
   * Handle reading emails
   */
  async handleReadEmails(userId, parameters) {
    try {
      const limit = parameters.limit || 5; // Default to 5 for voice
      let emails;
      let description = 'emails';

      // Handle different email types
      switch (parameters.emailType) {
        case 'unread':
          emails = await this.emailService.getUnreadEmails(userId, limit);
          description = 'unread emails';
          break;
        case 'important':
          emails = await this.emailService.getImportantEmails(userId, limit);
          description = 'important emails';
          break;
        default:
          emails = await this.emailService.getEmails(userId, { limit });
          description = 'recent emails';
      }

      // Filter by sender if specified
      if (parameters.senderFilter) {
        emails = emails.filter(email => 
          email.sender?.toLowerCase().includes(parameters.senderFilter.toLowerCase())
        );
        description = `emails from ${parameters.senderFilter}`;
      }

      return {
        success: true,
        data: emails,
        summary: `Found ${emails.length} ${description}`,
        actions: ['read_emails'],
        details: {
          emailCount: emails.length,
          description: description,
          emails: emails.map(email => this.formatEmailForVoice(email))
        }
      };

    } catch (error) {
      logger.error('Error reading emails:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to retrieve emails'
      };
    }
  }

  /**
   * Handle sending emails
   */
  async handleSendEmail(userId, parameters) {
    try {
      // Validate required parameters
      const missingInfo = [];
      if (!parameters.to) missingInfo.push('recipient email');
      if (!parameters.subject) missingInfo.push('subject');
      if (!parameters.body) missingInfo.push('message content');

      if (missingInfo.length > 0) {
        return {
          success: false,
          error: `Missing required information: ${missingInfo.join(', ')}`,
          needsMoreInfo: true,
          missingInfo: missingInfo
        };
      }

      // Prepare email data
      const emailData = {
        to: parameters.to,
        subject: parameters.subject,
        body: parameters.body,
        cc: parameters.cc || null,
        bcc: parameters.bcc || null
      };

      // Send the email
      const result = await this.emailService.sendEmail(userId, emailData);

      return {
        success: true,
        data: result,
        summary: `Sent email to ${parameters.to}`,
        actions: ['send_email'],
        details: {
          messageId: result.id,
          recipient: parameters.to,
          subject: parameters.subject
        }
      };

    } catch (error) {
      logger.error('Error sending email:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to send email'
      };
    }
  }

  /**
   * Handle replying to emails
   */
  async handleReplyEmail(userId, parameters) {
    try {
      if (!parameters.messageId && !parameters.replyTo) {
        return {
          success: false,
          error: 'Email ID or sender information required for reply',
          needsMoreInfo: true,
          missingInfo: ['messageId', 'replyTo']
        };
      }

      if (!parameters.replyText) {
        return {
          success: false,
          error: 'Reply content is required',
          needsMoreInfo: true,
          missingInfo: ['replyText']
        };
      }

      // Find email to reply to if messageId not provided
      let messageId = parameters.messageId;
      if (!messageId && parameters.replyTo) {
        const emails = await this.emailService.searchEmails(userId, `from:${parameters.replyTo}`, 1);
        if (emails.length === 0) {
          return {
            success: false,
            error: `No recent emails found from ${parameters.replyTo}`
          };
        }
        messageId = emails[0].id;
      }

      // Send the reply
      const result = await this.emailService.replyToEmail(userId, messageId, parameters.replyText);

      return {
        success: true,
        data: result,
        summary: `Sent reply successfully`,
        actions: ['reply_email'],
        details: {
          messageId: result.id,
          originalMessageId: messageId
        }
      };

    } catch (error) {
      logger.error('Error replying to email:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to send reply'
      };
    }
  }

  /**
   * Handle searching emails
   */
  async handleSearchEmails(userId, parameters) {
    try {
      if (!parameters.searchQuery) {
        return {
          success: false,
          error: 'Search query is required',
          needsMoreInfo: true,
          missingInfo: ['searchQuery']
        };
      }

      const emails = await this.emailService.searchEmails(userId, parameters.searchQuery, parameters.limit || 5);

      return {
        success: true,
        data: emails,
        summary: `Found ${emails.length} emails matching "${parameters.searchQuery}"`,
        actions: ['search_emails'],
        details: {
          searchQuery: parameters.searchQuery,
          resultCount: emails.length,
          emails: emails.map(email => this.formatEmailForVoice(email))
        }
      };

    } catch (error) {
      logger.error('Error searching emails:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to search emails'
      };
    }
  }

  /**
   * Handle marking emails as read
   */
  async handleMarkRead(userId, parameters) {
    try {
      if (!parameters.messageId) {
        return {
          success: false,
          error: 'Email ID is required',
          needsMoreInfo: true,
          missingInfo: ['messageId']
        };
      }

      const result = await this.emailService.markAsRead(userId, parameters.messageId);

      return {
        success: true,
        data: result,
        summary: 'Marked email as read',
        actions: ['mark_read'],
        details: {
          messageId: parameters.messageId
        }
      };

    } catch (error) {
      logger.error('Error marking email as read:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to mark email as read'
      };
    }
  }

  /**
   * Handle marking emails as unread
   */
  async handleMarkUnread(userId, parameters) {
    try {
      if (!parameters.messageId) {
        return {
          success: false,
          error: 'Email ID is required',
          needsMoreInfo: true,
          missingInfo: ['messageId']
        };
      }

      const result = await this.emailService.markAsUnread(userId, parameters.messageId);

      return {
        success: true,
        data: result,
        summary: 'Marked email as unread',
        actions: ['mark_unread'],
        details: {
          messageId: parameters.messageId
        }
      };

    } catch (error) {
      logger.error('Error marking email as unread:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to mark email as unread'
      };
    }
  }

  /**
   * Handle deleting emails
   */
  async handleDeleteEmail(userId, parameters) {
    try {
      if (!parameters.messageId) {
        return {
          success: false,
          error: 'Email ID is required',
          needsMoreInfo: true,
          missingInfo: ['messageId']
        };
      }

      const result = await this.emailService.deleteEmail(userId, parameters.messageId);

      return {
        success: true,
        data: result,
        summary: 'Deleted email successfully',
        actions: ['delete_email'],
        details: {
          messageId: parameters.messageId
        }
      };

    } catch (error) {
      logger.error('Error deleting email:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to delete email'
      };
    }
  }

  /**
   * Handle getting unread email count
   */
  async handleGetUnreadCount(userId, parameters) {
    try {
      const unreadEmails = await this.emailService.getUnreadEmails(userId, 100); // Get up to 100 to count
      const count = unreadEmails.length;

      return {
        success: true,
        data: { count, emails: unreadEmails.slice(0, 3) }, // Show first 3 for context
        summary: count === 0 ? 'No unread emails' : `You have ${count} unread email${count === 1 ? '' : 's'}`,
        actions: ['get_unread_count'],
        details: {
          unreadCount: count,
          hasUnread: count > 0
        }
      };

    } catch (error) {
      logger.error('Error getting unread count:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to get unread email count'
      };
    }
  }

  /**
   * Handle generic email queries using LLM
   */
  async handleGenericEmailQuery(userId, userInput, context, systemPrompt) {
    try {
      // Get recent email data for context
      const recentEmails = await this.emailService.getEmails(userId, { limit: 5 });

      const queryPrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        EMAIL CONTEXT:
        Recent Emails: {emails}

        USER QUERY: "{input}"

        Provide a helpful response about the user's emails. Be specific and actionable.
        If you need to perform an email action, explain what you would do.
        Keep the response under 50 words and voice-optimized.
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: queryPrompt
      });

      const result = await chain.call({
        input: userInput,
        emails: JSON.stringify(recentEmails.map(email => this.formatEmailForVoice(email)), null, 2)
      });

      return {
        success: true,
        summary: 'Email query processed',
        data: { response: result.text.trim() }
      };

    } catch (error) {
      logger.error('Error handling generic email query:', error);
      return {
        success: false,
        error: error.message,
        summary: 'Unable to process email query'
      };
    }
  }

  /**
   * Handle case where email integration is not available
   */
  handleNoEmailIntegration(userInput) {
    return {
      text: "I'd be happy to help with your emails, but you'll need to connect your Gmail account first. Would you like me to guide you through setting that up?",
      agentUsed: this.agentName,
      action: 'integration_required',
      actions: ['setup_email_integration'],
      context: {
        integrationNeeded: 'gmail',
        originalRequest: userInput
      }
    };
  }

  /**
   * Generate voice-optimized response
   */
  async generateResponse(userInput, result, systemPrompt, context) {
    try {
      const responsePrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        USER REQUEST: "{input}"
        
        EMAIL OPERATION RESULT:
        Success: {success}
        Summary: {summary}
        Details: {details}
        Error: {error}

        Generate a voice-optimized response that:
        1. Acknowledges the request
        2. Reports the result clearly
        3. For email lists, mention the count and first few items
        4. Suggests next actions if appropriate
        5. Keeps it under 50 words
        6. Uses natural, conversational language

        Response:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: responsePrompt
      });

      const response = await chain.call({
        input: userInput,
        success: result.success,
        summary: result.summary || 'Operation completed',
        details: JSON.stringify(result.details || {}, null, 2),
        error: result.error || 'None'
      });

      return response.text.trim();

    } catch (error) {
      logger.error('Error generating response:', error);
      return result.success ? 
        (result.summary || 'Email operation completed successfully.') :
        (result.error || 'I had trouble with that email request. Please try again.');
    }
  }

  /**
   * Handle errors
   */
  handleError(userInput, error) {
    return {
      text: "I'm sorry, I had trouble with that email request. Please try again or be more specific about what you'd like me to do.",
      agentUsed: this.agentName,
      action: 'error',
      actions: [],
      context: {
        error: error.message,
        originalRequest: userInput
      }
    };
  }

  /**
   * Helper methods
   */
  formatEmailForVoice(email) {
    const sender = this.extractSenderName(email.sender);
    const subject = email.subject || 'No subject';
    const timeAgo = this.getTimeAgo(email.timestamp);
    
    return {
      id: email.id,
      sender: sender,
      subject: subject,
      timeAgo: timeAgo,
      isUnread: !email.isRead,
      isImportant: email.isImportant,
      snippet: email.snippet?.substring(0, 100) + (email.snippet?.length > 100 ? '...' : '')
    };
  }

  extractSenderName(senderString) {
    if (!senderString) return 'Unknown sender';
    
    // Extract name from "Name <email@domain.com>" format
    const nameMatch = senderString.match(/^(.+?)\s*<.+>$/);
    if (nameMatch) {
      return nameMatch[1].trim().replace(/"/g, '');
    }
    
    // If just email, extract name part
    const emailMatch = senderString.match(/^([^@]+)@/);
    if (emailMatch) {
      return emailMatch[1].replace(/[._]/g, ' ');
    }
    
    return senderString;
  }

  getTimeAgo(timestamp) {
    const now = new Date();
    const emailTime = new Date(timestamp);
    const diffMs = now - emailTime;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else {
      return emailTime.toLocaleDateString();
    }
  }

  /**
   * Compose email using LLM assistance
   */
  async composeEmailWithLLM(userId, parameters, systemPrompt) {
    try {
      const compositionPrompt = PromptTemplate.fromTemplate(`
        ${systemPrompt}

        TASK: Compose an email based on user requirements.

        Requirements:
        To: {to}
        Subject: {subject}
        Key Points: {keyPoints}
        Tone: {tone}
        
        Generate a professional email that:
        1. Has an appropriate greeting
        2. Clearly communicates the key points
        3. Uses the specified tone
        4. Includes a proper closing
        5. Is concise but complete

        Email:
      `);

      const chain = new LLMChain({
        llm: this.llm,
        prompt: compositionPrompt
      });

      const result = await chain.call({
        to: parameters.to || 'the recipient',
        subject: parameters.subject || 'Important message',
        keyPoints: parameters.keyPoints || parameters.body || 'General communication',
        tone: parameters.tone || 'professional'
      });

      return result.text.trim();

    } catch (error) {
      logger.error('Error composing email with LLM:', error);
      return parameters.body || 'Please provide the email content.';
    }
  }

  /**
   * Validate email address format
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Extract email addresses from text
   */
  extractEmailAddresses(text) {
    const emailRegex = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g;
    return text.match(emailRegex) || [];
  }
}

module.exports = EmailAgent;