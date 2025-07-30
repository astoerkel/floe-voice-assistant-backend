#!/usr/bin/env node

/**
 * Test script for the Enhanced LangChain Coordinator
 * This demonstrates the coordinator's capabilities with real integrations
 */

const EnhancedLangChainCoordinator = require('./enhancedCoordinator');
const logger = require('../../utils/logger');

// Load environment variables
require('dotenv').config({ path: '../../../.env' });

// Initialize database connection
const { prisma } = require('../../config/database');

async function testCoordinator() {
  try {
    console.log('\n🚀 Testing Enhanced LangChain Coordinator\n');

    // Initialize the coordinator
    const coordinator = new EnhancedLangChainCoordinator();

    // Test user ID (you can change this to test with a specific user)
    const testUserId = process.env.TEST_USER_ID || 'test-user-123';

    // Check coordinator stats
    console.log('📊 Coordinator Stats:');
    console.log(JSON.stringify(coordinator.getStats(), null, 2));

    // Perform health check
    console.log('\n🏥 Health Check:');
    const health = await coordinator.healthCheck();
    console.log(JSON.stringify(health, null, 2));

    // Test different types of requests
    const testRequests = [
      {
        name: 'Calendar Query',
        input: "What's on my calendar today?",
        context: { source: 'test' }
      },
      {
        name: 'Create Event',
        input: "Schedule a meeting with the team tomorrow at 3pm for 1 hour",
        context: { source: 'test' }
      },
      {
        name: 'Email Query',
        input: "Check my unread emails",
        context: { source: 'test' }
      },
      {
        name: 'Task Creation',
        input: "Create a task to review the quarterly report by end of week",
        context: { source: 'test' }
      },
      {
        name: 'Weather Query',
        input: "What's the weather like today?",
        context: { source: 'test' }
      },
      {
        name: 'Complex Request',
        input: "Find a free time slot tomorrow afternoon for a 30 minute meeting and check if I have any urgent emails",
        context: { source: 'test' }
      },
      {
        name: 'General Query',
        input: "What can you help me with?",
        context: { source: 'test' }
      }
    ];

    // Process each test request
    for (const test of testRequests) {
      console.log(`\n\n🎯 Test: ${test.name}`);
      console.log(`📝 Input: "${test.input}"`);
      console.log('⏳ Processing...\n');

      try {
        const result = await coordinator.processRequest(testUserId, test.input, test.context);
        
        console.log('✅ Success:', result.success);
        console.log('💬 Response:', result.response);
        console.log('⏱️ Execution Time:', `${result.executionTime}ms`);
        console.log('🔧 Tools Used:', result.toolsUsed || 'None');
        
        if (result.error) {
          console.log('❌ Error:', result.error);
        }
      } catch (error) {
        console.error('❌ Test failed:', error.message);
      }

      // Add a small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Test conversation memory
    console.log('\n\n🧠 Testing Conversation Memory:');
    const memoryTest = [
      "My name is John and I work at Acme Corp",
      "What's my name?",
      "Where do I work?"
    ];

    for (const input of memoryTest) {
      console.log(`\n📝 Input: "${input}"`);
      const result = await coordinator.processRequest(testUserId, input, { source: 'memory-test' });
      console.log('💬 Response:', result.response);
    }

    // Get conversation history
    console.log('\n\n📜 Conversation History:');
    const history = await coordinator.getConversationHistory(testUserId, 5);
    history.forEach((entry, index) => {
      console.log(`\n${index + 1}. User: ${entry.userInput}`);
      console.log(`   Assistant: ${entry.assistantResponse.substring(0, 100)}...`);
      console.log(`   Time: ${entry.createdAt}`);
    });

    // Clear memory for the test user
    console.log('\n\n🧹 Clearing user memory...');
    coordinator.clearUserMemory(testUserId);
    console.log('✅ Memory cleared');

    console.log('\n\n✨ All tests completed!\n');

  } catch (error) {
    console.error('\n❌ Fatal error during testing:', error);
    console.error(error.stack);
  } finally {
    // Clean up database connection
    await prisma.$disconnect();
    process.exit(0);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCoordinator();
}

module.exports = { testCoordinator };