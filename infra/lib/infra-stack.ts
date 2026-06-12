import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';

interface InfraStackProps extends cdk.StackProps {
  appName: string;
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    const { appName } = props;
    const region = this.region;

    // ─── ECR Repository ───
    const repo = new ecr.Repository(this, 'EcrRepo', {
      repositoryName: appName,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10 }],
    });

    // ─── Secrets Manager (placeholders) ───
    const secret = new secretsmanager.Secret(this, 'AppSecrets', {
      secretName: `${appName}/secrets`,
      description: 'Secrets for Azure Health Dashboard',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          AZURE_CLIENT_SECRET: 'REPLACE_ME',
          AZURE_AD_CLIENT_SECRET: 'REPLACE_ME',
          NEXTAUTH_SECRET: 'REPLACE_ME_RANDOM_32_CHARS',
          TEAMS_WEBHOOK_URL: 'REPLACE_ME',
          CRON_SECRET: 'REPLACE_ME_RANDOM_32_CHARS',
        }),
        generateStringKey: '_generated',
      },
    });

    // ─── IAM Role for App Runner ───
    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Role for App Runner service (Bedrock + Secrets)',
    });

    instanceRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        `arn:aws:bedrock:*::foundation-model/anthropic.claude-*`,
        `arn:aws:bedrock:*:${this.account}:inference-profile/eu.anthropic.claude-*`,
        `arn:aws:bedrock:*:${this.account}:inference-profile/us.anthropic.claude-*`,
      ],
    }));

    instanceRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secret.secretArn],
    }));

    instanceRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }));

    // ─── App Runner Access Role (for ECR pull) ───
    const accessRole = new iam.Role(this, 'AppRunnerAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
    });
    repo.grantPull(accessRole);

    // ─── App Runner Service ───
    const service = new apprunner.CfnService(this, 'AppRunnerService', {
      serviceName: appName,
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: `${repo.repositoryUri}:latest`,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '3000',
            runtimeEnvironmentVariables: [
              { name: 'AI_PROVIDER', value: 'bedrock' },
              { name: 'AWS_REGION', value: region },
              { name: 'BEDROCK_MODEL_ID', value: 'eu.anthropic.claude-sonnet-4-20250514' },
              { name: 'AZURE_TENANT_ID', value: 'REPLACE_IN_CONSOLE' },
              { name: 'AZURE_CLIENT_ID', value: 'REPLACE_IN_CONSOLE' },
              { name: 'AZURE_AD_TENANT_ID', value: 'REPLACE_IN_CONSOLE' },
              { name: 'AZURE_AD_CLIENT_ID', value: 'REPLACE_IN_CONSOLE' },
              { name: 'AZURE_MONTHLY_BUDGET_USD', value: '5000' },
              { name: 'REMEDIATION_ENABLED', value: 'false' },
              { name: 'NODE_ENV', value: 'production' },
              { name: 'SECRETS_ARN', value: secret.secretArn },
            ],
          },
        },
      },
      instanceConfiguration: {
        cpu: '1 vCPU',
        memory: '2 GB',
        instanceRoleArn: instanceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      autoScalingConfigurationArn: new apprunner.CfnAutoScalingConfiguration(this, 'AutoScaling', {
        autoScalingConfigurationName: `${appName}-autoscale`,
        maxConcurrency: 100,
        maxSize: 3,
        minSize: 1,
      }).attrAutoScalingConfigurationArn,
    });

    // ─── Lambda for Daily Report ───
    const reportLogGroup = new logs.LogGroup(this, 'ReportLambdaLogs', {
      logGroupName: `/aws/lambda/${appName}-daily-report`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const reportLambdaRole = new iam.Role(this, 'ReportLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    reportLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }));
    reportLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secret.secretArn],
    }));

    const reportLambda = new lambda.Function(this, 'DailyReportLambda', {
      functionName: `${appName}-daily-report`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

exports.handler = async () => {
  const sm = new SecretsManagerClient({});
  const secretResp = await sm.send(new GetSecretValueCommand({ SecretId: process.env.SECRETS_ARN }));
  const secrets = JSON.parse(secretResp.SecretString);
  const cronSecret = secrets.CRON_SECRET;
  const dashboardUrl = process.env.DASHBOARD_URL;

  console.log('Triggering daily report at', new Date().toISOString());

  const response = await fetch(dashboardUrl + '/api/report/generate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + cronSecret,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('Report API returned ' + response.status + ': ' + body);
  }

  const result = await response.json();
  console.log('Report sent successfully');
  return { statusCode: 200, body: JSON.stringify(result) };
};
      `),
      timeout: cdk.Duration.seconds(60),
      role: reportLambdaRole,
      environment: {
        DASHBOARD_URL: `https://${service.attrServiceUrl}`,
        SECRETS_ARN: secret.secretArn,
      },
      logGroup: reportLogGroup,
    });

    // ─── EventBridge Scheduler (7h Europe/Paris) ───
    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    reportLambda.grantInvoke(schedulerRole);

    new scheduler.CfnSchedule(this, 'DailyReportSchedule', {
      name: `${appName}-daily-report`,
      scheduleExpression: 'cron(0 7 * * ? *)',
      scheduleExpressionTimezone: 'Europe/Paris',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: reportLambda.functionArn,
        roleArn: schedulerRole.roleArn,
      },
    });

    // ─── CloudWatch Alarm on 5xx ───
    const appLogGroup = new logs.LogGroup(this, 'AppLogGroup', {
      logGroupName: `/apprunner/${appName}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const errorMetric = new cloudwatch.Metric({
      namespace: 'AWS/AppRunner',
      metricName: '5xxStatusResponses',
      dimensionsMap: { ServiceName: appName },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    new cloudwatch.Alarm(this, 'Error5xxAlarm', {
      alarmName: `${appName}-5xx-errors`,
      metric: errorMetric,
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // ─── Outputs ───
    new cdk.CfnOutput(this, 'AppUrl', {
      value: `https://${service.attrServiceUrl}`,
      description: 'App Runner service URL',
    });

    new cdk.CfnOutput(this, 'EcrUri', {
      value: repo.repositoryUri,
      description: 'ECR repository URI',
    });

    new cdk.CfnOutput(this, 'SecretsArn', {
      value: secret.secretArn,
      description: 'Secrets Manager ARN',
    });
  }
}
