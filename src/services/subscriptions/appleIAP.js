const axios = require('axios');
const crypto = require('crypto');
const { prisma } = require('../../config/database');
const logger = require('../../utils/logger');

class AppleIAPService {
  constructor() {
    this.sandboxUrl = 'https://sandbox.itunes.apple.com/verifyReceipt';
    this.productionUrl = 'https://buy.itunes.apple.com/verifyReceipt';
    this.sharedSecret = process.env.APPLE_SHARED_SECRET;
    
    // Product IDs should match those configured in App Store Connect
    this.productIds = {
      premium_monthly: 'com.floe.voiceassistant.premium.monthly',
      premium_yearly: 'com.floe.voiceassistant.premium.yearly',
      pro_monthly: 'com.floe.voiceassistant.pro.monthly',
      pro_yearly: 'com.floe.voiceassistant.pro.yearly'
    };
  }

  // Verify receipt with Apple servers
  async verifyReceipt(receiptData, isProduction = true) {
    try {
      const url = isProduction ? this.productionUrl : this.sandboxUrl;
      
      const requestBody = {
        'receipt-data': receiptData,
        'password': this.sharedSecret,
        'exclude-old-transactions': true
      };

      logger.info('Verifying receipt with Apple', { 
        url: isProduction ? 'production' : 'sandbox',
        receiptLength: receiptData.length 
      });

      const response = await axios.post(url, requestBody, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const { status, receipt, latest_receipt_info } = response.data;

      // Handle different status codes
      if (status === 21007 && isProduction) {
        // Receipt is from sandbox, retry with sandbox URL
        logger.info('Receipt is from sandbox, retrying with sandbox URL');
        return await this.verifyReceipt(receiptData, false);
      }

      if (status !== 0) {
        throw new Error(`Apple receipt verification failed with status: ${status}`);
      }

      return {
        success: true,
        receipt,
        latestReceiptInfo: latest_receipt_info,
        environment: isProduction ? 'production' : 'sandbox'
      };
    } catch (error) {
      logger.error('Apple receipt verification failed:', error);
      throw new Error('Receipt verification failed');
    }
  }

  // Process subscription purchase
  async processPurchase(userId, receiptData, transactionId) {
    try {
      // Verify receipt with Apple
      const verification = await this.verifyReceipt(receiptData);
      
      if (!verification.success) {
        throw new Error('Receipt verification failed');
      }

      // Find the relevant transaction
      const transaction = verification.latestReceiptInfo?.find(
        t => t.transaction_id === transactionId
      ) || verification.receipt.in_app?.find(
        t => t.transaction_id === transactionId
      );

      if (!transaction) {
        throw new Error('Transaction not found in receipt');
      }

      // Check if transaction is already processed
      const existingPurchase = await prisma.subscriptionEvent.findUnique({
        where: { transactionId }
      });

      if (existingPurchase) {
        logger.info('Transaction already processed', { transactionId });
        return { success: true, alreadyProcessed: true };
      }

      // Determine subscription tier and duration
      const subscriptionInfo = this.parseProductId(transaction.product_id);
      
      // Calculate expiry date
      const purchaseDate = new Date(parseInt(transaction.purchase_date_ms));
      const expiryDate = new Date(parseInt(transaction.expires_date_ms));

      // Update user subscription
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionTier: subscriptionInfo.tier,
          subscriptionStatus: 'active',
          subscriptionExpiry: expiryDate,
          monthlyUsageLimit: subscriptionInfo.usageLimit
        }
      });

      // Record subscription event
      await prisma.subscriptionEvent.create({
        data: {
          userId,
          eventType: 'purchase',
          subscriptionTier: subscriptionInfo.tier,
          amount: parseFloat(transaction.price || '0'),
          currency: transaction.currency || 'USD',
          transactionId,
          appleTransactionId: transaction.original_transaction_id,
          receiptData,
          expiryDate,
          metadata: {
            productId: transaction.product_id,
            environment: verification.environment,
            purchaseDate: purchaseDate.toISOString(),
            bundleId: verification.receipt.bundle_id
          }
        }
      });

      logger.info('Subscription purchase processed successfully', {
        userId,
        tier: subscriptionInfo.tier,
        transactionId,
        expiryDate
      });

      return {
        success: true,
        subscription: {
          tier: subscriptionInfo.tier,
          status: 'active',
          expiryDate,
          usageLimit: subscriptionInfo.usageLimit
        }
      };
    } catch (error) {
      logger.error('Failed to process purchase:', error);
      throw error;
    }
  }

  // Handle subscription renewal
  async processRenewal(userId, receiptData) {
    try {
      const verification = await this.verifyReceipt(receiptData);
      
      if (!verification.success || !verification.latestReceiptInfo) {
        throw new Error('Invalid renewal receipt');
      }

      // Get the latest transaction
      const latestTransaction = verification.latestReceiptInfo
        .sort((a, b) => parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms))[0];

      // Check if this renewal is already processed
      const existingRenewal = await prisma.subscriptionEvent.findUnique({
        where: { transactionId: latestTransaction.transaction_id }
      });

      if (existingRenewal) {
        logger.info('Renewal already processed', { 
          transactionId: latestTransaction.transaction_id 
        });
        return { success: true, alreadyProcessed: true };
      }

      const subscriptionInfo = this.parseProductId(latestTransaction.product_id);
      const newExpiryDate = new Date(parseInt(latestTransaction.expires_date_ms));

      // Update user subscription
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: 'active',
          subscriptionExpiry: newExpiryDate
        }
      });

      // Record renewal event
      await prisma.subscriptionEvent.create({
        data: {
          userId,
          eventType: 'renewal',
          subscriptionTier: subscriptionInfo.tier,
          amount: parseFloat(latestTransaction.price || '0'),
          currency: latestTransaction.currency || 'USD',
          transactionId: latestTransaction.transaction_id,
          appleTransactionId: latestTransaction.original_transaction_id,
          receiptData,
          expiryDate: newExpiryDate,
          metadata: {
            productId: latestTransaction.product_id,
            environment: verification.environment,
            renewalDate: new Date().toISOString()
          }
        }
      });

      logger.info('Subscription renewal processed', {
        userId,
        newExpiryDate,
        transactionId: latestTransaction.transaction_id
      });

      return { success: true, expiryDate: newExpiryDate };
    } catch (error) {
      logger.error('Failed to process renewal:', error);
      throw error;
    }
  }

  // Handle subscription cancellation
  async processCancellation(userId, receiptData) {
    try {
      const verification = await this.verifyReceipt(receiptData);
      
      if (!verification.success) {
        throw new Error('Invalid cancellation receipt');
      }

      // Update user subscription status
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: 'cancelled'
          // Keep expiry date - user retains access until expiry
        }
      });

      // Record cancellation event
      await prisma.subscriptionEvent.create({
        data: {
          userId,
          eventType: 'cancellation',
          metadata: {
            cancellationDate: new Date().toISOString(),
            environment: verification.environment
          }
        }
      });

      logger.info('Subscription cancellation processed', { userId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to process cancellation:', error);
      throw error;
    }
  }

  // Check and update expired subscriptions
  async processExpiredSubscriptions() {
    try {
      const now = new Date();
      
      // Find users with expired subscriptions
      const expiredUsers = await prisma.user.findMany({
        where: {
          subscriptionExpiry: { lt: now },
          subscriptionStatus: { in: ['active', 'cancelled'] }
        }
      });

      logger.info(`Processing ${expiredUsers.length} expired subscriptions`);

      for (const user of expiredUsers) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionTier: 'free',
            subscriptionStatus: 'expired',
            monthlyUsageLimit: 50 // Free tier limit
          }
        });

        // Record expiration event
        await prisma.subscriptionEvent.create({
          data: {
            userId: user.id,
            eventType: 'expiration',
            subscriptionTier: 'free',
            metadata: {
              previousTier: user.subscriptionTier,
              expirationDate: new Date().toISOString()
            }
          }
        });

        logger.info('Subscription expired', { 
          userId: user.id, 
          previousTier: user.subscriptionTier 
        });
      }

      return { processedCount: expiredUsers.length };
    } catch (error) {
      logger.error('Failed to process expired subscriptions:', error);
      throw error;
    }
  }

  // Restore purchases for a user
  async restorePurchases(userId, receiptData) {
    try {
      const verification = await this.verifyReceipt(receiptData);
      
      if (!verification.success || !verification.latestReceiptInfo) {
        return { success: true, activeSubscriptions: [] };
      }

      // Find active subscriptions
      const activeSubscriptions = verification.latestReceiptInfo.filter(transaction => {
        const expiryDate = new Date(parseInt(transaction.expires_date_ms));
        return expiryDate > new Date();
      });

      if (activeSubscriptions.length === 0) {
        return { success: true, activeSubscriptions: [] };
      }

      // Get the most recent active subscription
      const latestSubscription = activeSubscriptions
        .sort((a, b) => parseInt(b.expires_date_ms) - parseInt(a.expires_date_ms))[0];

      const subscriptionInfo = this.parseProductId(latestSubscription.product_id);
      const expiryDate = new Date(parseInt(latestSubscription.expires_date_ms));

      // Update user subscription
      await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionTier: subscriptionInfo.tier,
          subscriptionStatus: 'active',
          subscriptionExpiry: expiryDate,
          monthlyUsageLimit: subscriptionInfo.usageLimit
        }
      });

      // Record restore event
      await prisma.subscriptionEvent.create({
        data: {
          userId,
          eventType: 'restore',
          subscriptionTier: subscriptionInfo.tier,
          transactionId: latestSubscription.transaction_id,
          expiryDate,
          metadata: {
            productId: latestSubscription.product_id,
            restoredAt: new Date().toISOString(),
            activeSubscriptionsCount: activeSubscriptions.length
          }
        }
      });

      logger.info('Purchases restored successfully', {
        userId,
        tier: subscriptionInfo.tier,
        expiryDate
      });

      return {
        success: true,
        activeSubscriptions: [{
          tier: subscriptionInfo.tier,
          expiryDate,
          productId: latestSubscription.product_id
        }]
      };
    } catch (error) {
      logger.error('Failed to restore purchases:', error);
      throw error;
    }
  }

  // Parse product ID to determine subscription info
  parseProductId(productId) {
    const productConfig = {
      [this.productIds.premium_monthly]: {
        tier: 'premium',
        duration: 'monthly',
        usageLimit: 500
      },
      [this.productIds.premium_yearly]: {
        tier: 'premium',
        duration: 'yearly',
        usageLimit: 500
      },
      [this.productIds.pro_monthly]: {
        tier: 'pro',
        duration: 'monthly',
        usageLimit: -1 // Unlimited
      },
      [this.productIds.pro_yearly]: {
        tier: 'pro',
        duration: 'yearly',
        usageLimit: -1 // Unlimited
      }
    };

    const config = productConfig[productId];
    if (!config) {
      throw new Error(`Unknown product ID: ${productId}`);
    }

    return config;
  }

  // Validate webhook from Apple (Server-to-Server notifications)
  validateWebhookSignature(payload, signature) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.sharedSecret)
        .update(payload)
        .digest('base64');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Webhook signature validation failed:', error);
      return false;
    }
  }

  // Process Apple Server-to-Server notification
  async processWebhook(notificationPayload) {
    try {
      const { notification_type, unified_receipt } = notificationPayload;
      
      // Extract user information from receipt
      const bundleId = unified_receipt?.bundle_id;
      const latestReceiptInfo = unified_receipt?.latest_receipt_info;
      
      if (!latestReceiptInfo || latestReceiptInfo.length === 0) {
        logger.warn('No receipt info in webhook notification');
        return { success: false, error: 'No receipt info' };
      }

      // Find user by original transaction ID or app user ID
      const latestTransaction = latestReceiptInfo[latestReceiptInfo.length - 1];
      const originalTransactionId = latestTransaction.original_transaction_id;
      
      // Look up user by transaction history
      const existingEvent = await prisma.subscriptionEvent.findFirst({
        where: {
          appleTransactionId: originalTransactionId
        },
        include: {
          user: true
        }
      });

      if (!existingEvent) {
        logger.warn('User not found for webhook notification', { originalTransactionId });
        return { success: false, error: 'User not found' };
      }

      const userId = existingEvent.userId;

      // Process different notification types
      switch (notification_type) {
        case 'INITIAL_BUY':
          return await this.processPurchase(
            userId, 
            unified_receipt.latest_receipt, 
            latestTransaction.transaction_id
          );

        case 'DID_RENEW':
          return await this.processRenewal(userId, unified_receipt.latest_receipt);

        case 'DID_CANCEL':
        case 'VOLUNTARY_CANCEL':
          return await this.processCancellation(userId, unified_receipt.latest_receipt);

        case 'EXPIRED':
          // Handle in batch job, but update status immediately
          await prisma.user.update({
            where: { id: userId },
            data: {
              subscriptionStatus: 'expired',
              subscriptionTier: 'free',
              monthlyUsageLimit: 50
            }
          });
          return { success: true };

        case 'DID_RECOVER':
        case 'RESUBSCRIBE':
          return await this.processRenewal(userId, unified_receipt.latest_receipt);

        default:
          logger.info('Unhandled notification type', { notification_type });
          return { success: true, unhandled: true };
      }
    } catch (error) {
      logger.error('Failed to process webhook:', error);
      throw error;
    }
  }
}

module.exports = AppleIAPService;