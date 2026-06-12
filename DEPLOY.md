# Deployment Guide — Azure Health Dashboard on AWS

## Architecture

```
ECR → App Runner (HTTPS, autoscaling) → Bedrock (Claude)
                                       → Secrets Manager
EventBridge (cron 7h Paris) → Lambda → POST /api/report/generate
CloudWatch: logs + 5xx alarm
```

## Prerequisites

- AWS CLI v2 configured with admin credentials
- Node.js 20+
- Docker
- AWS CDK CLI: `npm install -g aws-cdk`

## 1. Deploy Infrastructure (CDK)

```bash
cd infra
npm install
cdk bootstrap   # first time only
cdk deploy
```

Note the outputs:
- `AppUrl` — your public HTTPS URL
- `EcrUri` — ECR repository URI
- `SecretsArn` — the Secrets Manager ARN

## 2. Build & Push Docker Image

```bash
# Login to ECR
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.eu-west-1.amazonaws.com

# Build & push
docker build -t <ECR_URI>:latest .
docker push <ECR_URI>:latest

# Trigger App Runner deployment
aws apprunner start-deployment --service-arn <SERVICE_ARN>
```

## 3. Configure Secrets (MANUAL)

In the AWS Console (Secrets Manager), edit the secret `azure-health-dashboard/secrets`:

| Key | Value |
|-----|-------|
| `AZURE_CLIENT_SECRET` | Azure Service Principal secret |
| `AZURE_AD_CLIENT_SECRET` | Same SP secret (for NextAuth) |
| `NEXTAUTH_SECRET` | Random 32+ char string (`openssl rand -base64 32`) |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams incoming webhook URL |
| `CRON_SECRET` | Random 32+ char string (`openssl rand -base64 32`) |

## 4. Configure App Runner Environment Variables

In the App Runner console, update these env vars with real values:
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_AD_TENANT_ID`
- `AZURE_AD_CLIENT_ID`
- `NEXTAUTH_URL` = `https://<AppUrl>`
- `NEXT_PUBLIC_APP_URL` = `https://<AppUrl>`

## 5. Manual Steps (REQUIRED)

### Enable Bedrock Model Access
1. Go to AWS Console → Amazon Bedrock → Model access (in target region)
2. Request access to `Anthropic Claude` models
3. Wait for approval (usually instant)

### Azure AD Redirect URI
1. Get your App Runner URL from the CDK output
2. In Azure Portal → App registrations → your app → Authentication
3. Add redirect URI: `https://<APP_URL>/api/auth/callback/azure-ad`

### Verify Azure Service Principal
Ensure the SP has `Reader` role at the root Management Group of the Azure tenant.

## CI/CD (GitHub Actions)

The `.github/workflows/deploy.yml` pipeline:
1. Builds the Docker image
2. Pushes to ECR
3. Triggers App Runner deployment

### Setup:
1. Create an IAM role for GitHub Actions (OIDC) with permissions for ECR push + App Runner deploy
2. Add `AWS_DEPLOY_ROLE_ARN` as a GitHub Actions secret

## Useful Commands

```bash
# Check App Runner status
aws apprunner describe-service --service-arn <ARN>

# View logs
aws logs tail /apprunner/azure-health-dashboard --follow

# Test the cron Lambda manually
aws lambda invoke --function-name azure-health-dashboard-daily-report /dev/stdout
```
