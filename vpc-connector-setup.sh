#!/bin/bash

# VPC Connector Setup Script for Voice Assistant Backend
# This script creates a VPC connector to allow Cloud Run to access private Redis instance

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${PROJECT_ID:-floe-voice-assistant}"
REGION="${REGION:-us-central1}"
VPC_CONNECTOR_NAME="voice-assistant-vpc-conn"
NETWORK_NAME="default"  # or your custom network name
SUBNET_NAME="vpc-connector-subnet"
IP_RANGE="10.8.0.0/28"  # Must be /28 and not overlap with existing ranges
REDIS_IP="10.244.122.235"
REDIS_PORT="6379"

echo -e "${GREEN}Starting VPC Connector setup for Voice Assistant backend...${NC}"

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
    vpcaccess.googleapis.com \
    compute.googleapis.com \
    servicenetworking.googleapis.com

# Check if the network exists
echo -e "${YELLOW}Checking network configuration...${NC}"
if ! gcloud compute networks describe $NETWORK_NAME --quiet 2>/dev/null; then
    echo -e "${RED}Error: Network '$NETWORK_NAME' does not exist. Please create it first or update the NETWORK_NAME variable.${NC}"
    exit 1
fi

# Create subnet for VPC connector (if it doesn't exist)
echo -e "${YELLOW}Creating subnet for VPC connector...${NC}"
if ! gcloud compute networks subnets describe $SUBNET_NAME --region=$REGION --quiet 2>/dev/null; then
    gcloud compute networks subnets create $SUBNET_NAME \
        --network=$NETWORK_NAME \
        --region=$REGION \
        --range=$IP_RANGE
    
    echo -e "${GREEN}Subnet created successfully!${NC}"
else
    echo -e "${GREEN}Subnet already exists.${NC}"
fi

# Create VPC connector
echo -e "${YELLOW}Creating VPC connector...${NC}"
if ! gcloud compute networks vpc-access connectors describe $VPC_CONNECTOR_NAME --region=$REGION --quiet 2>/dev/null; then
    gcloud compute networks vpc-access connectors create $VPC_CONNECTOR_NAME \
        --region=$REGION \
        --subnet=$SUBNET_NAME \
        --subnet-project=$PROJECT_ID \
        --min-instances=2 \
        --max-instances=10 \
        --machine-type=e2-micro
    
    echo -e "${GREEN}VPC connector created successfully!${NC}"
else
    echo -e "${GREEN}VPC connector already exists.${NC}"
fi

# Check VPC connector status
echo -e "${YELLOW}Checking VPC connector status...${NC}"
CONNECTOR_STATUS=$(gcloud compute networks vpc-access connectors describe $VPC_CONNECTOR_NAME --region=$REGION --format="value(state)")
echo "VPC Connector Status: $CONNECTOR_STATUS"

if [ "$CONNECTOR_STATUS" = "READY" ]; then
    echo -e "${GREEN}VPC connector is ready!${NC}"
else
    echo -e "${YELLOW}VPC connector is still being created. Status: $CONNECTOR_STATUS${NC}"
    echo -e "${YELLOW}You may need to wait a few minutes for it to be ready.${NC}"
fi

# Get VPC connector information
CONNECTOR_FULL_NAME=$(gcloud compute networks vpc-access connectors describe $VPC_CONNECTOR_NAME --region=$REGION --format="value(name)")

echo -e "${GREEN}VPC Connector setup complete!${NC}"
echo -e "${YELLOW}=== VPC Connector Information ===${NC}"
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "VPC Connector Name: $VPC_CONNECTOR_NAME"
echo "Full Connector Name: $CONNECTOR_FULL_NAME"
echo "Network: $NETWORK_NAME"
echo "Subnet: $SUBNET_NAME"
echo "IP Range: $IP_RANGE"
echo "Redis IP: $REDIS_IP:$REDIS_PORT"
echo ""
echo -e "${YELLOW}=== Next Steps ===${NC}"
echo "1. Update your Cloud Run deployment to use the VPC connector:"
echo "   Add this flag to your gcloud run deploy command:"
echo "   --vpc-connector=$VPC_CONNECTOR_NAME"
echo ""
echo "2. Or add this to your cloudbuild.yaml:"
echo "   - '--vpc-connector'"
echo "   - '$VPC_CONNECTOR_NAME'"
echo ""
echo "3. Test Redis connectivity from Cloud Run:"
echo "   Your Redis instance at $REDIS_IP:$REDIS_PORT should now be accessible"
echo ""
echo "4. Monitor VPC connector usage:"
echo "   gcloud compute networks vpc-access connectors describe $VPC_CONNECTOR_NAME --region=$REGION"
echo ""
echo -e "${GREEN}VPC Connector setup completed successfully!${NC}"