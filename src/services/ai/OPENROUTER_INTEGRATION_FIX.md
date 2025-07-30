# OpenRouter Integration Fix for LangChain

## Problem Summary

The original implementation had an incorrect configuration for integrating OpenRouter with LangChain's ChatOpenAI class. The configuration object structure was wrong, causing the OpenRouter headers and base URL to not be properly set.

## Root Cause

The ChatOpenAI constructor in the JavaScript/TypeScript version of LangChain expects two parameters:
1. Model configuration object (modelName, temperature, etc.)
2. HTTP configuration object (basePath, headers, etc.)

The original code incorrectly nested the HTTP configuration inside the model configuration object.

## Solution

### Before (Incorrect):
```javascript
this.llm = new ChatOpenAI({
  modelName: 'openai/gpt-4o',
  temperature: 0.7,
  maxTokens: 2000,
  openAIApiKey: process.env.OPENROUTER_API_KEY,
  configuration: {  // ❌ Wrong: This is not a valid property
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL,
      'X-Title': process.env.OPENROUTER_SITE_NAME
    }
  }
});
```

### After (Correct):
```javascript
this.llm = new ChatOpenAI(
  {
    modelName: 'openai/gpt-4o',
    temperature: 0.7,
    maxTokens: 2000,
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
```

## Key Changes

1. **Two-Parameter Constructor**: The ChatOpenAI constructor is now called with two separate objects
2. **basePath**: Used instead of baseURL for the API endpoint
3. **baseOptions.headers**: Headers are nested under baseOptions
4. **Default Values**: Added fallback values for site URL and name

## Environment Variables Required

```bash
# OpenRouter API Key (must start with sk-or-)
OPENROUTER_API_KEY=sk-or-v1-xxxxx

# Optional: Site identification for OpenRouter analytics
OPENROUTER_SITE_URL=https://floe.cognetica.de
OPENROUTER_SITE_NAME=voice_assistant
```

## Testing the Integration

Run the test script to verify the integration:

```bash
cd /opt/simple-voice-backend
node src/services/ai/testOpenRouter.js
```

The test script will:
1. Verify API key format
2. Test basic completion
3. Test streaming responses
4. Test function calling capability
5. Test error handling

## Alternative Approaches

### 1. Custom Wrapper Class (Recommended for complex projects):
```javascript
class ChatOpenRouter extends ChatOpenAI {
  constructor(config) {
    const { modelName, ...otherConfig } = config;
    super(
      {
        modelName,
        openAIApiKey: process.env.OPENROUTER_API_KEY,
        ...otherConfig
      },
      {
        basePath: 'https://openrouter.ai/api/v1',
        baseOptions: {
          headers: {
            'HTTP-Referer': process.env.OPENROUTER_SITE_URL,
            'X-Title': process.env.OPENROUTER_SITE_NAME
          }
        }
      }
    );
  }
}
```

### 2. Factory Function:
```javascript
function createOpenRouterLLM(modelName, options = {}) {
  return new ChatOpenAI(
    {
      modelName,
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      ...options
    },
    {
      basePath: 'https://openrouter.ai/api/v1',
      baseOptions: {
        headers: {
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL,
          'X-Title': process.env.OPENROUTER_SITE_NAME
        }
      }
    }
  );
}
```

## Troubleshooting

### Common Issues:

1. **Invalid API Key Error**: Ensure OPENROUTER_API_KEY starts with 'sk-or-'
2. **Connection Refused**: Check if the basePath is correct (https://openrouter.ai/api/v1)
3. **Model Not Found**: Verify the model name follows OpenRouter's naming convention
4. **Rate Limiting**: OpenRouter has different rate limits than OpenAI

### Debug Tips:

1. Enable verbose logging:
```javascript
const llm = new ChatOpenAI(
  { /* config */ },
  {
    basePath: 'https://openrouter.ai/api/v1',
    baseOptions: {
      headers: { /* headers */ },
      // Add request/response logging
      validateStatus: (status) => {
        console.log('Response status:', status);
        return status >= 200 && status < 300;
      }
    }
  }
);
```

2. Check the actual request being sent:
```javascript
// In the catch block of API calls
console.error('Request config:', error.config);
console.error('Response data:', error.response?.data);
```

## Benefits of This Fix

1. **Proper Routing**: Requests now correctly go to OpenRouter's API
2. **Analytics**: HTTP-Referer and X-Title headers enable proper tracking in OpenRouter dashboard
3. **Cost Efficiency**: Using OpenRouter can be more cost-effective than direct OpenAI API
4. **Model Variety**: Access to multiple models through a single API key
5. **Fallback Support**: The system can now properly handle OpenRouter-specific features

## Next Steps

1. Test the integration using the provided test script
2. Monitor OpenRouter dashboard for API usage
3. Consider implementing retry logic for transient failures
4. Set up proper error handling for OpenRouter-specific errors
5. Configure model fallbacks if needed

## References

- [OpenRouter Documentation](https://openrouter.ai/docs)
- [LangChain ChatOpenAI Documentation](https://js.langchain.com/docs/integrations/chat/openai/)
- [OpenRouter LangChain Examples](https://github.com/OpenRouterTeam/openrouter-examples)