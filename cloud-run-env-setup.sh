#!/bin/bash
# Script to properly configure environment variables for Cloud Run
# Handles existing environment variables without conflicts

set -e

PROJECT_ID="floe-voice-assistant"
SERVICE_NAME="voice-assistant-backend"
REGION="us-central1"

echo "🔧 Configuring Cloud Run environment variables..."

# Function to update environment variables safely
update_env_vars() {
    local env_updates=""
    
    # Build environment variable string
    while IFS='=' read -r key value; do
        if [ ! -z "$key" ] && [ ! -z "$value" ]; then
            if [ ! -z "$env_updates" ]; then
                env_updates+=","
            fi
            env_updates+="${key}=${value}"
        fi
    done
    
    if [ ! -z "$env_updates" ]; then
        gcloud run services update $SERVICE_NAME \
            --region=$REGION \
            --update-env-vars="$env_updates"
    fi
}

# Check if service exists
if ! gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(name)" 2>/dev/null; then
    echo "❌ Error: Service $SERVICE_NAME does not exist in region $REGION"
    echo "Please deploy the service first using the CI/CD pipeline"
    exit 1
fi

echo "
📝 Environment Variables Configuration
=====================================

Please provide the following environment variables.
Press Enter to skip any variable you don't want to set.
"

# Collect environment variables
declare -A env_vars

read -p "OPENAI_API_KEY (for GPT-4 and Whisper): " OPENAI_API_KEY
[ ! -z "$OPENAI_API_KEY" ] && env_vars["OPENAI_API_KEY"]="$OPENAI_API_KEY"

read -p "DATABASE_URL (PostgreSQL connection string): " DATABASE_URL
[ ! -z "$DATABASE_URL" ] && env_vars["DATABASE_URL"]="$DATABASE_URL"

read -p "REDIS_URL (Redis connection string): " REDIS_URL
[ ! -z "$REDIS_URL" ] && env_vars["REDIS_URL"]="$REDIS_URL"

read -p "JWT_SECRET (for authentication): " JWT_SECRET
[ ! -z "$JWT_SECRET" ] && env_vars["JWT_SECRET"]="$JWT_SECRET"

read -p "GOOGLE_APPLICATION_CREDENTIALS_JSON (service account JSON): " GOOGLE_CREDS
[ ! -z "$GOOGLE_CREDS" ] && env_vars["GOOGLE_APPLICATION_CREDENTIALS_JSON"]="$GOOGLE_CREDS"

# Update environment variables
echo "
🚀 Updating Cloud Run service..."

for key in "${!env_vars[@]}"; do
    echo "$key=${env_vars[$key]}" | update_env_vars
done

echo "
✅ Environment variables updated successfully!

To verify the configuration:
gcloud run services describe $SERVICE_NAME --region=$REGION --format='export' | grep -A 20 'env:'

To test the service:
SERVICE_URL=\$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')
curl \$SERVICE_URL/health
"