# VPC Connector Setup for Voice Assistant Backend

This guide explains how to set up a VPC connector to allow your Google Cloud Run service to access the private Redis instance.

## Overview

Your Redis instance is configured at `10.244.122.235:6379` in the `us-central1` region. Cloud Run services cannot access private IP addresses by default, so a VPC connector is required.

## Quick Setup

1. **Create the VPC connector:**
   ```bash
   ./vpc-connector-setup.sh
   ```

2. **Deploy the service with VPC connector:**
   ```bash
   ./deploy-to-gcp.sh
   ```

3. **Test connectivity:**
   ```bash
   ./test-vpc-connectivity.sh
   ```

## What the VPC Connector Does

- Creates a subnet (`10.8.0.0/28`) dedicated to the VPC connector
- Allows Cloud Run to route traffic to private IP addresses
- Enables access to your Redis instance at `10.244.122.235:6379`
- Provides secure communication within your VPC

## Files Modified

- `deploy-to-gcp.sh` - Updated to include `--vpc-connector` flag
- `cloudbuild.yaml` - Updated to include VPC connector in deployment

## Manual Setup (Alternative)

If you prefer to set up manually:

1. **Enable APIs:**
   ```bash
   gcloud services enable vpcaccess.googleapis.com compute.googleapis.com
   ```

2. **Create VPC connector:**
   ```bash
   gcloud compute networks vpc-access connectors create voice-assistant-vpc-connector \
     --region=us-central1 \
     --subnet=vpc-connector-subnet \
     --subnet-project=floe-voice-assistant \
     --min-instances=2 \
     --max-instances=10 \
     --machine-type=e2-micro
   ```

3. **Deploy with VPC connector:**
   ```bash
   gcloud run deploy voice-assistant-backend \
     --vpc-connector=voice-assistant-vpc-connector \
     [... other flags ...]
   ```

## Troubleshooting

### VPC Connector Not Ready
- Check status: `gcloud compute networks vpc-access connectors describe voice-assistant-vpc-connector --region=us-central1`
- Wait a few minutes for creation to complete

### Redis Connection Issues
- Verify Redis IP: `gcloud redis instances describe voice-assistant-redis --region=us-central1 --format="value(host)"`
- Check Cloud Run logs for connection errors
- Ensure VPC connector is attached to Cloud Run service

### IP Range Conflicts
- The connector uses `10.8.0.0/28` by default
- If this conflicts with your network, update the IP range in `vpc-connector-setup.sh`

## Cost Considerations

- VPC connectors have a base cost (~$0.36/hour when running)
- Additional cost for throughput (~$0.045/GB)
- Use `--min-instances=2` for production reliability
- Consider `--min-instances=1` for development to reduce costs

## Security Notes

- VPC connector creates a secure tunnel between Cloud Run and your VPC
- No external access is provided to your private resources
- Traffic is encrypted and stays within Google's network

## Monitoring

- View connector usage in Google Cloud Console
- Monitor Redis connections in Cloud Run logs
- Set up alerts for connection failures

## Next Steps

1. Run `./vpc-connector-setup.sh` to create the connector
2. Deploy your service with `./deploy-to-gcp.sh`
3. Test connectivity with `./test-vpc-connectivity.sh`
4. Monitor your application logs for Redis connectivity

For more information, see the [official VPC connector documentation](https://cloud.google.com/vpc/docs/configure-serverless-vpc-access).