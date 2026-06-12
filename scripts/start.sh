#!/bin/sh
# Fetch secrets from AWS Secrets Manager and export as environment variables.

if [ -n "$SECRETS_ARN" ]; then
  echo "Fetching secrets from Secrets Manager..."
  SECRETS_JSON=$(node --no-warnings -e "
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    (async () => {
      const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
      const resp = await client.send(new GetSecretValueCommand({ SecretId: process.env.SECRETS_ARN }));
      process.stdout.write(resp.SecretString);
    })().catch(e => { console.error('Failed to fetch secrets:', e.message); process.exit(1); });
  ") || true

  if [ -n "$SECRETS_JSON" ] && echo "$SECRETS_JSON" | node --no-warnings -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null; then
    export AZURE_CLIENT_SECRET=$(echo "$SECRETS_JSON" | node --no-warnings -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).AZURE_CLIENT_SECRET || '')")
    export AZURE_AD_CLIENT_SECRET=$(echo "$SECRETS_JSON" | node --no-warnings -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).AZURE_AD_CLIENT_SECRET || '')")
    export NEXTAUTH_SECRET=$(echo "$SECRETS_JSON" | node --no-warnings -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).NEXTAUTH_SECRET || '')")
    export TEAMS_WEBHOOK_URL=$(echo "$SECRETS_JSON" | node --no-warnings -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).TEAMS_WEBHOOK_URL || '')")
    export CRON_SECRET=$(echo "$SECRETS_JSON" | node --no-warnings -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).CRON_SECRET || '')")
    echo "Secrets loaded successfully."
  else
    echo "WARNING: Could not parse secrets. App starting without them."
  fi
fi

echo "Starting Next.js server on port ${PORT:-3000}..."
export HOSTNAME="0.0.0.0"
exec node server.js
