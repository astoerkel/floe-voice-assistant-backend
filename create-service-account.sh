#!/bin/bash

echo "🔐 Setting up Google Cloud Service Account for Text-to-Speech"
echo ""

# Variables
PROJECT_ID="southern-engine-461211-j3"
SERVICE_ACCOUNT_NAME="voice-assistant-tts"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="voice-assistant-ios-key.json"

# Use local gcloud installation
GCLOUD="./google-cloud-sdk/bin/gcloud"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "📋 Configuration:"
echo "  Project ID: $PROJECT_ID"
echo "  Service Account: $SERVICE_ACCOUNT_NAME"
echo "  Key File: $KEY_FILE"
echo ""

# Check if gcloud exists
if [ ! -f "$GCLOUD" ]; then
    echo -e "${RED}❌ gcloud not found at $GCLOUD${NC}"
    exit 1
fi

echo "✅ Using gcloud at: $GCLOUD"
echo ""

# Check if user is authenticated
echo "🔍 Checking authentication..."
if ! $GCLOUD auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${YELLOW}⚠️  You need to authenticate with Google Cloud${NC}"
    echo "Running: $GCLOUD auth login"
    $GCLOUD auth login
fi

# Set the project
echo ""
echo "📁 Setting project to: $PROJECT_ID"
$GCLOUD config set project $PROJECT_ID

# Check if service account already exists
echo ""
echo "🔍 Checking if service account exists..."
if $GCLOUD iam service-accounts describe $SERVICE_ACCOUNT_EMAIL &>/dev/null; then
    echo -e "${YELLOW}⚠️  Service account already exists${NC}"
    read -p "Do you want to create a new key for it? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Exiting..."
        exit 0
    fi
else
    # Create service account
    echo "✨ Creating service account..."
    $GCLOUD iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name="Voice Assistant Text-to-Speech Service" \
        --description="Service account for Google Text-to-Speech API access"
    
    echo -e "${GREEN}✅ Service account created${NC}"
fi

# Grant permissions
echo ""
echo "🔐 Granting Text-to-Speech permissions..."
$GCLOUD projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/cloudtexttospeech.admin" \
    --quiet

echo -e "${GREEN}✅ Permissions granted${NC}"

# Create key file
echo ""
echo "🔑 Creating service account key..."
if [ -f "$KEY_FILE" ]; then
    # Check if file is empty
    if [ ! -s "$KEY_FILE" ]; then
        echo -e "${YELLOW}⚠️  Key file exists but is empty. Creating new key...${NC}"
        $GCLOUD iam service-accounts keys create $KEY_FILE \
            --iam-account=$SERVICE_ACCOUNT_EMAIL \
            --key-file-type=json
        echo -e "${GREEN}✅ Key file created: $KEY_FILE${NC}"
    else
        echo -e "${YELLOW}⚠️  Key file already exists and has content: $KEY_FILE${NC}"
        read -p "Overwrite? (y/n): " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Keeping existing file..."
        else
            $GCLOUD iam service-accounts keys create $KEY_FILE \
                --iam-account=$SERVICE_ACCOUNT_EMAIL \
                --key-file-type=json
            echo -e "${GREEN}✅ Key file created: $KEY_FILE${NC}"
        fi
    fi
else
    $GCLOUD iam service-accounts keys create $KEY_FILE \
        --iam-account=$SERVICE_ACCOUNT_EMAIL \
        --key-file-type=json
    echo -e "${GREEN}✅ Key file created: $KEY_FILE${NC}"
fi

# Create/update .env file
echo ""
echo "📝 Updating .env file..."
if [ -f ".env" ]; then
    # Remove old GOOGLE_APPLICATION_CREDENTIALS if exists
    grep -v "GOOGLE_APPLICATION_CREDENTIALS\|GOOGLE_CLOUD_PROJECT_ID" .env > .env.tmp && mv .env.tmp .env
    
    # Add new configuration
    echo "" >> .env
    echo "# Google Cloud Text-to-Speech Configuration" >> .env
    echo "GOOGLE_APPLICATION_CREDENTIALS=./voice-assistant-ios-key.json" >> .env
    echo "GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID" >> .env
    
    echo -e "${GREEN}✅ Updated .env file${NC}"
else
    echo -e "${YELLOW}⚠️  No .env file found. Creating one...${NC}"
    cat > .env << EOF
# Google Cloud Text-to-Speech Configuration
GOOGLE_APPLICATION_CREDENTIALS=./voice-assistant-ios-key.json
GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID

# Add your other environment variables here
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
BACKEND_URL=
EOF
    echo -e "${GREEN}✅ Created .env file${NC}"
fi

# For Railway deployment
echo ""
echo "📋 For Railway/Cloud deployment:"
echo "1. Copy the JSON as a single line:"
echo "   cat $KEY_FILE | jq -c . | pbcopy"
echo ""
echo "2. Add as environment variable in Railway:"
echo "   GOOGLE_APPLICATION_CREDENTIALS_JSON='<paste-json-here>'"
echo ""

# Verify the key file
if [ -f "$KEY_FILE" ] && [ -s "$KEY_FILE" ]; then
    echo "🔍 Verifying key file..."
    if cat "$KEY_FILE" | jq -e '.type' &>/dev/null; then
        echo -e "${GREEN}✅ Key file is valid JSON${NC}"
        
        # Display key info
        PROJECT=$(cat "$KEY_FILE" | jq -r '.project_id')
        ACCOUNT=$(cat "$KEY_FILE" | jq -r '.client_email')
        echo "   Project: $PROJECT"
        echo "   Account: $ACCOUNT"
    else
        echo -e "${RED}❌ Key file is not valid JSON${NC}"
    fi
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Restart your backend: npm run dev"
echo "2. Test the Text-to-Speech endpoint"
echo "3. Your iOS app should now work!"
echo ""
echo "⚠️  Security reminder:"
echo "- Never commit $KEY_FILE to git"
echo "- It's already in .gitignore"
echo "- Rotate keys regularly"