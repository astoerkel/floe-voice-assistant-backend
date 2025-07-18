#!/bin/bash

# VPC Connector Connectivity Test Script
# This script tests the VPC connector and Redis connectivity

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${PROJECT_ID:-floe-voice-assistant}"
REGION="${REGION:-us-central1}"
VPC_CONNECTOR_NAME="voice-assistant-vpc-connector"
SERVICE_NAME="voice-assistant-backend"
REDIS_IP="10.244.122.235"
REDIS_PORT="6379"

echo -e "${GREEN}Testing VPC Connector connectivity for Voice Assistant backend...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Set the project
gcloud config set project $PROJECT_ID

# Test 1: Check VPC connector status
echo -e "${YELLOW}Test 1: Checking VPC connector status...${NC}"
CONNECTOR_STATUS=$(gcloud compute networks vpc-access connectors describe $VPC_CONNECTOR_NAME --region=$REGION --format="value(state)" 2>/dev/null || echo "NOT_FOUND")

if [ "$CONNECTOR_STATUS" = "READY" ]; then
    echo -e "${GREEN}✓ VPC connector is ready${NC}"
elif [ "$CONNECTOR_STATUS" = "NOT_FOUND" ]; then
    echo -e "${RED}✗ VPC connector not found. Please run vpc-connector-setup.sh first${NC}"
    exit 1
else
    echo -e "${YELLOW}⚠ VPC connector status: $CONNECTOR_STATUS${NC}"
fi

# Test 2: Check Cloud Run service VPC connector configuration
echo -e "${YELLOW}Test 2: Checking Cloud Run service VPC connector configuration...${NC}"
SERVICE_VPC_CONNECTOR=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(spec.template.metadata.annotations.'run.googleapis.com/vpc-access-connector')" 2>/dev/null || echo "NOT_CONFIGURED")

if [ "$SERVICE_VPC_CONNECTOR" = "NOT_CONFIGURED" ] || [ -z "$SERVICE_VPC_CONNECTOR" ]; then
    echo -e "${RED}✗ Cloud Run service is not configured to use VPC connector${NC}"
    echo -e "${YELLOW}  Please redeploy the service with --vpc-connector flag${NC}"
else
    echo -e "${GREEN}✓ Cloud Run service is configured with VPC connector: $SERVICE_VPC_CONNECTOR${NC}"
fi

# Test 3: Check Redis instance status
echo -e "${YELLOW}Test 3: Checking Redis instance status...${NC}"
REDIS_STATUS=$(gcloud redis instances describe voice-assistant-redis --region=$REGION --format="value(state)" 2>/dev/null || echo "NOT_FOUND")

if [ "$REDIS_STATUS" = "READY" ]; then
    echo -e "${GREEN}✓ Redis instance is ready${NC}"
elif [ "$REDIS_STATUS" = "NOT_FOUND" ]; then
    echo -e "${RED}✗ Redis instance not found${NC}"
else
    echo -e "${YELLOW}⚠ Redis instance status: $REDIS_STATUS${NC}"
fi

# Test 4: Get Redis IP and verify it matches configuration
echo -e "${YELLOW}Test 4: Verifying Redis IP configuration...${NC}"
ACTUAL_REDIS_IP=$(gcloud redis instances describe voice-assistant-redis --region=$REGION --format="value(host)" 2>/dev/null || echo "NOT_FOUND")

if [ "$ACTUAL_REDIS_IP" = "$REDIS_IP" ]; then
    echo -e "${GREEN}✓ Redis IP matches configuration: $REDIS_IP${NC}"
elif [ "$ACTUAL_REDIS_IP" = "NOT_FOUND" ]; then
    echo -e "${RED}✗ Could not retrieve Redis IP${NC}"
else
    echo -e "${YELLOW}⚠ Redis IP mismatch. Expected: $REDIS_IP, Actual: $ACTUAL_REDIS_IP${NC}"
    echo -e "${YELLOW}  Please update your configuration to use: $ACTUAL_REDIS_IP${NC}"
fi

# Test 5: Test connectivity from Cloud Run (if service is deployed)
echo -e "${YELLOW}Test 5: Testing connectivity from Cloud Run service...${NC}"
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)" 2>/dev/null || echo "NOT_DEPLOYED")

if [ "$SERVICE_URL" = "NOT_DEPLOYED" ]; then
    echo -e "${YELLOW}⚠ Cloud Run service is not deployed. Deploy first to test connectivity${NC}"
else
    echo -e "${GREEN}✓ Cloud Run service is deployed at: $SERVICE_URL${NC}"
    
    # Test health endpoint
    echo -e "${YELLOW}  Testing health endpoint...${NC}"
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL/health" || echo "FAILED")
    
    if [ "$HTTP_STATUS" = "200" ]; then
        echo -e "${GREEN}  ✓ Health endpoint is responding${NC}"
    else
        echo -e "${RED}  ✗ Health endpoint failed with status: $HTTP_STATUS${NC}"
    fi
fi

# Summary
echo -e "${GREEN}=== VPC Connector Test Summary ===${NC}"
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "VPC Connector: $VPC_CONNECTOR_NAME ($CONNECTOR_STATUS)"
echo "Redis Instance: $REDIS_IP:$REDIS_PORT ($REDIS_STATUS)"
echo "Cloud Run Service: $SERVICE_NAME"
echo "Service URL: $SERVICE_URL"

echo ""
echo -e "${YELLOW}=== Next Steps ===${NC}"
if [ "$CONNECTOR_STATUS" != "READY" ]; then
    echo "1. Run vpc-connector-setup.sh to create the VPC connector"
fi

if [ "$SERVICE_VPC_CONNECTOR" = "NOT_CONFIGURED" ] || [ -z "$SERVICE_VPC_CONNECTOR" ]; then
    echo "2. Redeploy Cloud Run service with VPC connector:"
    echo "   ./deploy-to-gcp.sh"
fi

if [ "$ACTUAL_REDIS_IP" != "$REDIS_IP" ] && [ "$ACTUAL_REDIS_IP" != "NOT_FOUND" ]; then
    echo "3. Update Redis IP in your configuration files:"
    echo "   - src/config/gcp.js"
    echo "   - Environment variables"
fi

echo "4. Test Redis connectivity from your application logs"
echo "5. Monitor VPC connector usage in Google Cloud Console"

echo ""
echo -e "${GREEN}VPC Connector connectivity test completed!${NC}"