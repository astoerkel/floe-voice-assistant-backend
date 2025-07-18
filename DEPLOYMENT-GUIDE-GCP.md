# Google Cloud Platform Deployment Guide

This guide walks you through deploying the Voice Assistant backend from Railway to Google Cloud Platform.

## Prerequisites

1. **Google Cloud Account**: Ensure you have a Google Cloud account with billing enabled
2. **gcloud CLI**: Install and configure the Google Cloud CLI
3. **Project Setup**: Create a new GCP project or use an existing one
4. **API Keys**: Have your OpenAI API key and Airtable API key ready

## Step 1: Initial Setup

### 1.1 Install gcloud CLI

```bash
# macOS
brew install google-cloud-sdk

# Linux/WSL
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Windows
# Download and install from https://cloud.google.com/sdk/docs/install
```

### 1.2 Authenticate and Set Project

```bash
# Login to Google Cloud
gcloud auth login

# Set your project ID (replace with your actual project ID)
export PROJECT_ID="your-voice-assistant-project"
gcloud config set project $PROJECT_ID

# Enable billing (required for most services)
# This must be done through the Google Cloud Console
```

### 1.3 Clone and Navigate to Project

```bash
# Navigate to your project directory
cd /path/to/VoiceAssistant/voice-assistant-backend
```

## Step 2: Run the Setup Script

The setup script will create all necessary GCP resources:

```bash
# Make the script executable
chmod +x gcp-setup.sh

# Run the setup script
./gcp-setup.sh
```

This script will:
- Enable required APIs (Cloud Run, Cloud SQL, Redis, Storage, etc.)
- Create PostgreSQL instance
- Create Redis instance
- Create Cloud Storage bucket
- Set up Secret Manager secrets
- Create service account with proper permissions
- Create database migration job

## Step 3: Configure Secrets

After the setup script completes, you need to update the placeholder secrets:

### 3.1 Update OpenAI API Key

```bash
# Update the OpenAI API key
echo "your-actual-openai-api-key" | gcloud secrets versions add OPENAI_API_KEY --data-file=-
```

### 3.2 Update Airtable API Key

```bash
# Update the Airtable API key
echo "your-actual-airtable-api-key" | gcloud secrets versions add AIRTABLE_API_KEY --data-file=-
```

### 3.3 Create Google Cloud Service Account Key (Optional)

If you need a service account key for Text-to-Speech:

```bash
# Create service account key
gcloud iam service-accounts keys create key.json \
  --iam-account=voice-assistant-run@$PROJECT_ID.iam.gserviceaccount.com

# Upload to Secret Manager
gcloud secrets create GOOGLE_APPLICATION_CREDENTIALS --data-file=key.json

# Clean up local key file
rm key.json
```

## Step 4: Build and Deploy

### 4.1 Build the Docker Image

```bash
# Build and push the Docker image
gcloud builds submit --config cloudbuild.yaml
```

### 4.2 Deploy to Cloud Run

The Cloud Build will automatically deploy to Cloud Run. You can also deploy manually:

```bash
# Deploy to Cloud Run
gcloud run deploy voice-assistant-backend \
  --image gcr.io/$PROJECT_ID/voice-assistant-backend:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 100 \
  --timeout 900 \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --set-secrets REDIS_URL=REDIS_URL:latest \
  --set-secrets JWT_SECRET=JWT_SECRET:latest \
  --set-secrets OPENAI_API_KEY=OPENAI_API_KEY:latest \
  --set-secrets GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest \
  --set-secrets AIRTABLE_API_KEY=AIRTABLE_API_KEY:latest \
  --service-account voice-assistant-run@$PROJECT_ID.iam.gserviceaccount.com
```

## Step 5: Run Database Migrations

```bash
# Run database migrations
gcloud run jobs execute voice-assistant-migrations --region us-central1 --wait
```

## Step 6: Update iOS App Configuration

Get your new Cloud Run service URL and update the iOS app:

```bash
# Get the service URL
gcloud run services describe voice-assistant-backend --region us-central1 --format="value(status.url)"
```

Update the `Constants.swift` file in your iOS project with the new URL:

```swift
// In VoiceAssistant/Constants.swift
struct Constants {
    static let webhookURL = "https://your-cloud-run-url.run.app/api/voice/process-audio"
    static let apiBaseURL = "https://your-cloud-run-url.run.app/api"
    // ... other constants
}
```

## Step 7: Verify Deployment

### 7.1 Check Service Health

```bash
# Check if the service is healthy
curl "https://your-cloud-run-url.run.app/health"
```

### 7.2 Check Logs

```bash
# View logs
gcloud logs tail --follow --resource-type=cloud_run_revision --resource-labels=service_name=voice-assistant-backend
```

### 7.3 Test API Endpoints

```bash
# Test voice processing endpoint
curl -X POST "https://your-cloud-run-url.run.app/api/voice/process-text" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, test message", "platform": "ios"}'
```

## Step 8: Set Up CI/CD (Optional)

### 8.1 Connect to GitHub

```bash
# Connect your repository to Cloud Build
gcloud builds submit --config cloudbuild.yaml --substitutions=_GITHUB_REPO=your-repo
```

### 8.2 Set Up Triggers

```bash
# Create a build trigger
gcloud builds triggers create github \
  --repo-name=your-repo \
  --repo-owner=your-username \
  --branch-pattern="^main$" \
  --build-config=voice-assistant-backend/cloudbuild.yaml
```

## Step 9: Monitor and Scale

### 9.1 Set Up Monitoring

```bash
# Enable monitoring
gcloud services enable monitoring.googleapis.com

# Create uptime check
gcloud alpha monitoring uptime create-http-check \
  --check-id=voice-assistant-health \
  --display-name="Voice Assistant Health Check" \
  --uri="https://your-cloud-run-url.run.app/health"
```

### 9.2 Configure Autoscaling

Cloud Run automatically scales based on incoming requests. You can adjust the configuration:

```bash
# Update scaling configuration
gcloud run services update voice-assistant-backend \
  --region us-central1 \
  --min-instances 2 \
  --max-instances 200 \
  --cpu-throttling \
  --concurrency 80
```

## Cost Optimization

1. **Cloud SQL**: Use the smallest instance size that meets your needs
2. **Cloud Run**: Configure appropriate CPU and memory limits
3. **Redis**: Use Basic tier for development, Standard for production
4. **Storage**: Enable lifecycle policies for old audio files

## Security Best Practices

1. **IAM**: Use least privilege principle for service accounts
2. **Secrets**: Store all sensitive data in Secret Manager
3. **Network**: Configure VPC and firewall rules if needed
4. **Audit**: Enable audit logging for all services

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Check Cloud SQL instance status
   - Verify connection string format
   - Ensure service account has Cloud SQL Client role

2. **Redis Connection Issues**
   - Verify Memorystore instance is running
   - Check VPC network configuration
   - Ensure Redis is in the same region

3. **Secret Manager Issues**
   - Verify service account has Secret Manager Secret Accessor role
   - Check secret names match environment variables
   - Ensure secrets exist and have latest versions

4. **Build Failures**
   - Check Cloud Build logs
   - Verify Dockerfile syntax
   - Ensure all dependencies are properly installed

### Useful Commands

```bash
# Check service status
gcloud run services describe voice-assistant-backend --region us-central1

# View recent logs
gcloud logs read --limit 50 --resource-type=cloud_run_revision

# List all secrets
gcloud secrets list

# Check Cloud SQL instances
gcloud sql instances list

# Check Redis instances
gcloud redis instances list --region us-central1

# Monitor resource usage
gcloud monitoring metrics list
```

## Rollback Procedure

If you need to rollback to a previous version:

```bash
# List revisions
gcloud run revisions list --service voice-assistant-backend --region us-central1

# Rollback to specific revision
gcloud run services update-traffic voice-assistant-backend \
  --region us-central1 \
  --to-revisions REVISION_NAME=100
```

## Migration from Railway

After successful deployment to Google Cloud:

1. **Update DNS**: Point your domain to the new Cloud Run URL
2. **Update Client Apps**: Update iOS app configuration
3. **Test Thoroughly**: Verify all functionality works correctly
4. **Monitor**: Watch metrics and logs for any issues
5. **Cleanup Railway**: Cancel Railway services once migration is complete

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review Google Cloud documentation
3. Check service status pages
4. Contact Google Cloud support if needed

Your Voice Assistant backend is now running on Google Cloud Platform with improved reliability and scalability!