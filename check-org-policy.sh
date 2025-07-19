#\!/bin/bash

# Check current organization policy status
echo "🔍 Checking organization policy for service account key creation..."

# List all organization policies
gcloud resource-manager org-policies list --organization=YOUR_ORG_ID

echo ""
echo "🔍 Checking specific policy: iam.disableServiceAccountKeyCreation"

# Check the specific policy that is blocking us
gcloud resource-manager org-policies describe iam.disableServiceAccountKeyCreation --organization=YOUR_ORG_ID

echo ""
echo "💡 To modify this policy, you need Organization Policy Administrator role"
echo "💡 Role required: roles/orgpolicy.policyAdmin"


