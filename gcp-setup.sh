#!/bin/bash

# Google Cloud Platform setup script for Voice Assistant backend
# This script sets up all necessary GCP services for the Voice Assistant backend

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${PROJECT_ID:-voice-assistant-gcp}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
DB_INSTANCE_NAME="voice-assistant-postgres"
REDIS_INSTANCE_NAME="voice-assistant-redis"
SERVICE_NAME="voice-assistant-backend"
BUCKET_NAME="${PROJECT_ID}-audio-files"

echo -e "${GREEN}Starting Google Cloud Platform setup for Voice Assistant backend...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Set the project
echo -e "${YELLOW}Setting project to ${PROJECT_ID}...${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    sqladmin.googleapis.com \
    redis.googleapis.com \
    storage.googleapis.com \
    secretmanager.googleapis.com \
    iam.googleapis.com \
    container.googleapis.com \
    cloudresourcemanager.googleapis.com

# Create Cloud SQL instance (PostgreSQL)
echo -e "${YELLOW}Creating Cloud SQL PostgreSQL instance...${NC}"
if ! gcloud sql instances describe $DB_INSTANCE_NAME --quiet 2>/dev/null; then
    gcloud sql instances create $DB_INSTANCE_NAME \
        --database-version=POSTGRES_14 \
        --tier=db-f1-micro \
        --region=$REGION \
        --storage-type=SSD \
        --storage-size=20GB \
        --storage-auto-increase \
        --backup-start-time=03:00 \
        --retained-backups-count=7 \
        --deletion-protection
    
    # Create database
    gcloud sql databases create voiceassistant --instance=$DB_INSTANCE_NAME
    
    # Create database user
    gcloud sql users create voiceassistant-user \
        --instance=$DB_INSTANCE_NAME \
        --password=$(openssl rand -base64 32)
    
    echo -e "${GREEN}PostgreSQL instance created successfully!${NC}"
else
    echo -e "${GREEN}PostgreSQL instance already exists.${NC}"
fi

# Create Redis instance
echo -e "${YELLOW}Creating Redis instance...${NC}"
if ! gcloud redis instances describe $REDIS_INSTANCE_NAME --region=$REGION --quiet 2>/dev/null; then
    gcloud redis instances create $REDIS_INSTANCE_NAME \
        --region=$REGION \
        --memory-size=1GB \
        --redis-version=redis_6_x \
        --tier=basic
    
    echo -e "${GREEN}Redis instance created successfully!${NC}"
else
    echo -e "${GREEN}Redis instance already exists.${NC}"
fi

# Create Cloud Storage bucket for audio files
echo -e "${YELLOW}Creating Cloud Storage bucket...${NC}"
if ! gsutil ls -b gs://$BUCKET_NAME 2>/dev/null; then
    gsutil mb -l $REGION gs://$BUCKET_NAME
    
    # Set bucket permissions
    gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME
    
    echo -e "${GREEN}Cloud Storage bucket created successfully!${NC}"
else
    echo -e "${GREEN}Cloud Storage bucket already exists.${NC}"
fi

# Get connection strings
echo -e "${YELLOW}Getting connection information...${NC}"
DB_CONNECTION_NAME=$(gcloud sql instances describe $DB_INSTANCE_NAME --format="value(connectionName)")
REDIS_IP=$(gcloud redis instances describe $REDIS_INSTANCE_NAME --region=$REGION --format="value(host)")
REDIS_PORT=$(gcloud redis instances describe $REDIS_INSTANCE_NAME --region=$REGION --format="value(port)")

DATABASE_URL="postgresql://voiceassistant-user:$(gcloud sql users describe voiceassistant-user --instance=$DB_INSTANCE_NAME --format="value(password)")@/voiceassistant?host=/cloudsql/$DB_CONNECTION_NAME"
REDIS_URL="redis://$REDIS_IP:$REDIS_PORT"

# Create secrets in Secret Manager
echo -e "${YELLOW}Creating secrets in Secret Manager...${NC}"

# Database URL
echo $DATABASE_URL | gcloud secrets create DATABASE_URL --data-file=-

# Redis URL
echo $REDIS_URL | gcloud secrets create REDIS_URL --data-file=-

# JWT Secret
echo $(openssl rand -base64 64) | gcloud secrets create JWT_SECRET --data-file=-

# Placeholder secrets (you'll need to update these)
echo "your-openai-api-key-here" | gcloud secrets create OPENAI_API_KEY --data-file=-
echo $PROJECT_ID | gcloud secrets create GOOGLE_CLOUD_PROJECT_ID --data-file=-
echo "your-airtable-api-key-here" | gcloud secrets create AIRTABLE_API_KEY --data-file=-

# Create service account for Cloud Run
echo -e "${YELLOW}Creating service account...${NC}"
SERVICE_ACCOUNT_NAME="voice-assistant-run"
SERVICE_ACCOUNT_EMAIL="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL --quiet 2>/dev/null; then
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name="Voice Assistant Cloud Run Service Account"
    
    # Grant necessary permissions
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="roles/cloudsql.client"
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="roles/redis.editor"
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="roles/storage.objectAdmin"
    
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="roles/secretmanager.secretAccessor"
    
    echo -e "${GREEN}Service account created successfully!${NC}"
else
    echo -e "${GREEN}Service account already exists.${NC}"
fi

# Create migration job
echo -e "${YELLOW}Creating database migration job...${NC}"
gcloud run jobs create voice-assistant-migrations \
    --image=gcr.io/$PROJECT_ID/voice-assistant-backend:latest \
    --region=$REGION \
    --service-account=$SERVICE_ACCOUNT_EMAIL \
    --set-cloudsql-instances=$DB_CONNECTION_NAME \
    --set-secrets=DATABASE_URL=DATABASE_URL:latest \
    --command="npm" \
    --args="run,migrate" \
    --memory=1Gi \
    --cpu=1 \
    --max-retries=3 \
    --parallelism=1 \
    --task-count=1 \
    --task-timeout=3600 \
    --wait || true

# Output connection information
echo -e "${GREEN}Setup complete!${NC}"
echo -e "${YELLOW}=== Connection Information ===${NC}"
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Database Connection Name: $DB_CONNECTION_NAME"
echo "Redis Instance: $REDIS_IP:$REDIS_PORT"
echo "Storage Bucket: gs://$BUCKET_NAME"
echo "Service Account: $SERVICE_ACCOUNT_EMAIL"
echo ""
echo -e "${YELLOW}=== Next Steps ===${NC}"
echo "1. Update the OpenAI API key in Secret Manager:"
echo "   gcloud secrets versions add OPENAI_API_KEY --data-file=<path-to-key>"
echo ""
echo "2. Update the Airtable API key in Secret Manager:"
echo "   gcloud secrets versions add AIRTABLE_API_KEY --data-file=<path-to-key>"
echo ""
echo "3. Build and deploy the application:"
echo "   gcloud builds submit --config cloudbuild.yaml"
echo ""
echo "4. Your application will be available at:"
echo "   https://voice-assistant-backend-<hash>-$REGION.a.run.app"
echo ""
echo -e "${GREEN}Google Cloud Platform setup completed successfully!${NC}"