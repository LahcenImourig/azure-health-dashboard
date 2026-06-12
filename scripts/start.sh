#!/bin/sh
# Fetch secrets from AWS Secrets Manager and export as environment variables
# This runs at container start before Next.js boots.

set -e

if [ -n "$SECRETS_ARN" ]; then
  echo "Fetching secrets from Secrets Manager..."
  SECRETS_JSON=$(node -e "
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    (async () => {
      const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'eu-west-1' });
      const resp = await client.send(new GetSecretValueCommand({ SecretId: process.env.SECRETS_ARN }));
      process.stdout.write(resp.SecretString);
    })().catch(e => { console.error(e); process.exit(1); });
  ")

  export AZURE_CLIENT_SECRET=$(echo "$SECRETS_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).AZURE_CLIENT_SECRET || '')")
  export AZURE_AD_CLIENT_SECRET=$(echo "$SECRETS_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).AZURE_AD_CLIENT_SECRET || '')")
  export NEXTAUTH_SECRET=$(echo "$SECRETS_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).NEXTAUTH_SECRET || '')")
  export TEAMS_WEBHOOK_URL=$(echo "$SECRETS_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).TEAMS_WEBHOOK_URL || '')")
  export CRON_SECRET=$(echo "$SECRETS_JSON" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).CRON_SECRET || '')")
  export NEXTAUTH_URL="https://${HOSTNAME:-localhost}"

  echo "Secrets loaded successfully."
fi

exec node server.js
