# Google Cloud Setup Guide

This document outlines the steps to set up Google Cloud Platform for the Voice Assistant backend deployment.

## Prerequisites

- Google Cloud account with billing enabled
- `gcloud` CLI installed locally
- Project owner or editor permissions

## 1. Create Google Cloud Project

```bash
# Create new project
gcloud projects create floe-voice-assistant --name="Floe Voice Assistant"

# Set as default project
gcloud config set project floe-voice-assistant

# Enable billing (replace BILLING_ACCOUNT_ID with your billing account)
gcloud billing projects link floe-voice-assistant --billing-account=BILLING_ACCOUNT_ID
```

## 2. Enable Required APIs

```bash
# Enable necessary APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudresourcemanager.googleapis.com
```

## 3. Create Artifact Registry Repository

```bash
# Create Docker repository
gcloud artifacts repositories create voice-assistant \
  --repository-format=docker \
  --location=us-central1 \
  --description="Voice Assistant production container registry"
```

## 4. Set Up Service Account for GitHub Actions

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --description="Service account for GitHub Actions CI/CD" \
  --display-name="GitHub Actions"

# Grant necessary permissions
gcloud projects add-iam-policy-binding floe-voice-assistant \
  --member="serviceAccount:github-actions@floe-voice-assistant.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"

gcloud projects add-iam-policy-binding floe-voice-assistant \
  --member="serviceAccount:github-actions@floe-voice-assistant.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding floe-voice-assistant \
  --member="serviceAccount:github-actions@floe-voice-assistant.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding floe-voice-assistant \
  --member="serviceAccount:github-actions@floe-voice-assistant.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Create and download service account key
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions@floe-voice-assistant.iam.gserviceaccount.com
```

## 5. Create Secrets in Secret Manager

```bash
# Create secrets
echo -n "your-google-client-id" | gcloud secrets create google-oauth-client-id --data-file=-
echo -n "your-google-client-secret" | gcloud secrets create google-oauth-client-secret --data-file=-
echo -n "your-airtable-client-id" | gcloud secrets create airtable-client-id --data-file=-
echo -n "your-airtable-client-secret" | gcloud secrets create airtable-client-secret --data-file=-
echo -n "your-jwt-secret" | gcloud secrets create jwt-secret --data-file=-
echo -n "your-openai-api-key" | gcloud secrets create openai-api-key --data-file=-

# Grant service account access to secrets
for secret in google-oauth-client-id google-oauth-client-secret airtable-client-id airtable-client-secret jwt-secret openai-api-key; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:github-actions@floe-voice-assistant.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

## 6. Configure GitHub Repository Secrets

Add the following secrets to your GitHub repository:

1. **GCP_SA_KEY**: 
   ```bash
   # Base64 encode the service account key
   base64 github-actions-key.json | pbcopy  # On macOS
   # base64 github-actions-key.json | xclip -selection clipboard  # On Linux
   ```
   Paste this value as the secret in GitHub

2. **Other secrets to add**:
   - `PROJECT_ID`: `floe-voice-assistant`
   - `GOOGLE_CLIENT_ID`: Your Google OAuth client ID
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret
   - `AIRTABLE_CLIENT_ID`: Your Airtable OAuth client ID
   - `AIRTABLE_CLIENT_SECRET`: Your Airtable OAuth client secret
   - `JWT_SECRET`: Random string for JWT signing (generate with `openssl rand -base64 32`)

## 7. Domain Configuration (Optional)

If you want to use a custom domain:

```bash
# Verify domain ownership
gcloud domains verify your-domain.com

# Map domain to Cloud Run service
gcloud run domain-mappings create \
  --service=voice-assistant-backend \
  --domain=api.your-domain.com \
  --region=us-central1
```

## 8. Set Up Monitoring and Alerts

```bash
# Create notification channel
gcloud alpha monitoring channels create \
  --display-name="Voice Assistant Alerts" \
  --type=email \
  --channel-labels=email_address=your-email@example.com

# Create uptime check
gcloud monitoring uptime-checks create \
  voice-assistant-health \
  --resource-type=gce-instance \
  --hostname=your-service-url.run.app \
  --check-interval=60s
```

## 9. Budget Alerts

Set up budget alerts to monitor costs:

```bash
# This needs to be done in the Google Cloud Console
# Navigate to Billing > Budgets & alerts > Create budget
# Set monthly budget and alert thresholds
```

## 10. Verify Setup

After deployment, verify everything is working:

```bash
# Check Cloud Run service
gcloud run services describe voice-assistant-backend \
  --region=us-central1 \
  --format="get(status.url)"

# Test the health endpoint
curl https://your-service-url.run.app/health
```

## Security Best Practices

1. **Never commit secrets**: Always use Secret Manager
2. **Rotate keys regularly**: Set up key rotation reminders
3. **Use least privilege**: Grant minimal necessary permissions
4. **Enable audit logs**: Monitor access to sensitive resources
5. **Set up VPC**: Consider VPC for enhanced security

## Troubleshooting

### Common Issues

1. **Permission denied errors**: 
   - Check service account permissions
   - Ensure APIs are enabled

2. **Build failures**:
   - Check Docker configuration
   - Verify Artifact Registry permissions

3. **Secret access errors**:
   - Verify secret names match exactly
   - Check Secret Manager permissions

### Support Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [GitHub Actions + GCP Guide](https://cloud.google.com/blog/products/devops-sre/using-github-actions-with-google-cloud)
- [Secret Manager Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)

## Clean Up

To avoid charges when not in use:

```bash
# Delete Cloud Run service
gcloud run services delete voice-assistant-backend --region=us-central1

# Delete secrets (be careful!)
for secret in google-oauth-client-id google-oauth-client-secret airtable-client-id airtable-client-secret jwt-secret openai-api-key; do
  gcloud secrets delete $secret --quiet
done

# Delete service account
gcloud iam service-accounts delete github-actions@floe-voice-assistant.iam.gserviceaccount.com

# Delete Artifact Registry repository
gcloud artifacts repositories delete voice-assistant --location=us-central1
```