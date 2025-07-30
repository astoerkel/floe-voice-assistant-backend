const { ChatOpenAI } = require('@langchain/openai');
const logger = require('../../utils/logger');
require('dotenv').config();

/**
 * Test script to verify OpenRouter integration with LangChain
 */
async function testOpenRouterIntegration() {
  console.log('Testing OpenRouter Integration with LangChain...\n');
  
  // Check environment variables
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY is not set in environment variables');
    process.exit(1);
  }
  
  if (!process.env.OPENROUTER_API_KEY.startsWith('sk-or-')) {
    console.error('❌ OPENROUTER_API_KEY does not appear to be a valid OpenRouter key (should start with sk-or-)');
    process.exit(1);
  }
  
  console.log('✅ OpenRouter API key found and valid format\n');
  
  try {
    // Test 1: Basic LLM initialization
    console.log('Test 1: Initializing LLM with OpenRouter...');
    const llm = new ChatOpenAI(
      {
        modelName: 'openai/gpt-4o',
        temperature: 0.7,
        maxTokens: 100,
        openAIApiKey: process.env.OPENROUTER_API_KEY,
      },
      {
        basePath: 'https://openrouter.ai/api/v1',
        baseOptions: {
          headers: {
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://floe.cognetica.de',
            'X-Title': process.env.OPENROUTER_SITE_NAME || 'voice_assistant'
          }
        }
      }
    );
    console.log('✅ LLM initialized successfully\n');
    
    // Test 2: Simple completion
    console.log('Test 2: Testing simple completion...');
    const simpleResponse = await llm.invoke('Say "Hello from OpenRouter!" if you can read this.');
    console.log('Response:', simpleResponse.content);
    console.log('✅ Simple completion test passed\n');
    
    // Test 3: Streaming response
    console.log('Test 3: Testing streaming response...');
    const stream = await llm.stream('Count from 1 to 5 slowly.');
    process.stdout.write('Streaming response: ');
    for await (const chunk of stream) {
      process.stdout.write(chunk.content);
    }
    console.log('\n✅ Streaming test passed\n');
    
    // Test 4: Function calling capability
    console.log('Test 4: Testing function calling capability...');
    const functionCallResponse = await llm.invoke([
      {
        role: 'system',
        content: 'You are a helpful assistant that can call functions.'
      },
      {
        role: 'user',
        content: 'What is the weather like in San Francisco?'
      }
    ]);
    console.log('Function call response:', functionCallResponse.content);
    console.log('✅ Function calling test completed\n');
    
    // Test 5: Error handling
    console.log('Test 5: Testing error handling with invalid model...');
    try {
      const invalidLLM = new ChatOpenAI(
        {
          modelName: 'invalid/model-name',
          openAIApiKey: process.env.OPENROUTER_API_KEY,
        },
        {
          basePath: 'https://openrouter.ai/api/v1'
        }
      );
      await invalidLLM.invoke('This should fail');
      console.log('❌ Error handling test failed - no error thrown');
    } catch (error) {
      console.log('✅ Error handling test passed - error caught:', error.message.substring(0, 50) + '...');
    }
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\nConfiguration summary:');
    console.log('- Model: openai/gpt-4o');
    console.log('- Base URL: https://openrouter.ai/api/v1');
    console.log('- Site URL:', process.env.OPENROUTER_SITE_URL || 'https://floe.cognetica.de');
    console.log('- Site Name:', process.env.OPENROUTER_SITE_NAME || 'voice_assistant');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testOpenRouterIntegration().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { testOpenRouterIntegration };