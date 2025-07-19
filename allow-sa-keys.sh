#\!/bin/bash

# Script to allow service account key creation for specific project
ORG_ID="YOUR_ORGANIZATION_ID"
PROJECT_ID="floe-voice-assistant"

echo "🔧 Creating organization policy to allow service account key creation..."

# Create policy YAML
cat > allow-sa-keys-policy.yaml << EOF
constraint: constraints/iam.disableServiceAccountKeyCreation
listPolicy:
  allowedValues:
    - "under:projects/${PROJECT_ID}"
EOF

echo "📝 Policy created:"
cat allow-sa-keys-policy.yaml

echo ""
echo "🚀 Applying policy to organization..."

# Apply the policy
gcloud resource-manager org-policies set-policy allow-sa-keys-policy.yaml --organization=${ORG_ID}

echo "✅ Policy applied\! Service account key creation is now allowed for project: ${PROJECT_ID}"


