const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

async function validateOpenRouterKey() {
  console.log('🔍 Validating OpenRouter API Key...');
  
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    console.log('❌ No OPENROUTER_API_KEY found in .env');
    return false;
  }
  
  if (!apiKey.startsWith('sk-or-v1-')) {
    console.log('❌ OpenRouter API key format is incorrect (should start with sk-or-v1-)');
    console.log(`   Current key: ${apiKey.substring(0, 20)}...`);
    return false;
  }
  
  console.log('✅ OpenRouter API key format looks correct');
  console.log(`   Key: ${apiKey.substring(0, 20)}...`);
  
  // Test API call
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://floe.cognetica.de',
        'X-Title': process.env.OPENROUTER_SITE_NAME || 'Voice Assistant'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ OpenRouter API key is valid and working');
      console.log(`   Available models: ${data.data?.length || 'unknown'}`);
      return true;
    } else {
      console.log('❌ OpenRouter API key authentication failed');
      console.log(`   Status: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Failed to test OpenRouter API key');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function validateGoogleCloudCredentials() {
  console.log('\n🔍 Validating Google Cloud TTS Credentials...');
  
  // Check for service account file
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  
  if (apiKey) {
    console.log('✅ Found GOOGLE_TTS_API_KEY (using API key method)');
    console.log(`   Key: ${apiKey.substring(0, 20)}...`);
    
    // Test API key
    try {
      const testUrl = `https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`;
      const response = await fetch(testUrl);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Google TTS API key is valid and working');
        console.log(`   Available voices: ${data.voices?.length || 'unknown'}`);
        return true;
      } else {
        console.log('❌ Google TTS API key authentication failed');
        console.log(`   Status: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      console.log('❌ Failed to test Google TTS API key');
      console.log(`   Error: ${error.message}`);
      return false;
    }
  }
  
  if (credentialsPath) {
    console.log(`🔍 Checking service account file: ${credentialsPath}`);
    
    if (!fs.existsSync(credentialsPath)) {
      console.log('❌ Service account file does not exist');
      console.log(`   Expected path: ${path.resolve(credentialsPath)}`);
      return false;
    }
    
    try {
      const keyData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      
      if (keyData.type === 'service_account' && keyData.project_id) {
        console.log('✅ Service account file format is valid');
        console.log(`   Project ID: ${keyData.project_id}`);
        console.log(`   Client email: ${keyData.client_email}`);
        
        // Test with Google Cloud client
        const textToSpeech = require('@google-cloud/text-to-speech');
        const client = new textToSpeech.TextToSpeechClient({
          keyFilename: credentialsPath,
          projectId: keyData.project_id
        });
        
        const [voices] = await client.listVoices({ languageCode: 'en-US' });
        console.log('✅ Google Cloud TTS service account is valid and working');
        console.log(`   Available en-US voices: ${voices.length}`);
        return true;
        
      } else {
        console.log('❌ Service account file format is invalid');
        return false;
      }
    } catch (error) {
      console.log('❌ Failed to validate service account file');
      console.log(`   Error: ${error.message}`);
      return false;
    }
  }
  
  if (credentialsJson) {
    console.log('🔍 Checking GOOGLE_APPLICATION_CREDENTIALS_JSON...');
    try {
      const keyData = JSON.parse(credentialsJson);
      if (keyData.type === 'service_account' && keyData.project_id) {
        console.log('✅ Service account JSON format is valid');
        console.log(`   Project ID: ${keyData.project_id}`);
        return true;
      } else {
        console.log('❌ Service account JSON format is invalid');
        return false;
      }
    } catch (error) {
      console.log('❌ Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON');
      console.log(`   Error: ${error.message}`);
      return false;
    }
  }
  
  console.log('❌ No Google Cloud credentials found');
  console.log('   Need either:');
  console.log('   - GOOGLE_APPLICATION_CREDENTIALS (path to service account file)');
  console.log('   - GOOGLE_APPLICATION_CREDENTIALS_JSON (service account JSON)');
  console.log('   - GOOGLE_TTS_API_KEY (API key)');
  return false;
}

async function validateAllCredentials() {
  console.log('🚀 Voice Assistant Credential Validator');
  console.log('======================================\n');
  
  const openRouterValid = await validateOpenRouterKey();
  const googleCloudValid = await validateGoogleCloudCredentials();
  
  console.log('\n📊 Summary:');
  console.log(`OpenRouter API: ${openRouterValid ? '✅ Working' : '❌ Needs Fix'}`);
  console.log(`Google Cloud TTS: ${googleCloudValid ? '✅ Working' : '❌ Needs Fix'}`);
  
  if (openRouterValid && googleCloudValid) {
    console.log('\n🎉 All credentials are working! You can now test the voice assistant.');
    console.log('Run: node test-coordinator.js');
  } else {
    console.log('\n🔧 Fix needed:');
    if (!openRouterValid) {
      console.log('1. Get new OpenRouter API key from https://openrouter.ai/keys');
      console.log('2. Add to .env: OPENROUTER_API_KEY=sk-or-v1-your-key-here');
    }
    if (!googleCloudValid) {
      console.log('3. Set up Google Cloud TTS credentials (see fix-credentials.md)');
    }
  }
  
  return { openRouterValid, googleCloudValid };
}

// Run validation
validateAllCredentials().catch(error => {
  console.error('❌ Validation failed:', error.message);
  process.exit(1);
});