#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';

const app = new cdk.App();

const appName = app.node.tryGetContext('appName') ?? 'azure-health-dashboard';
const region = app.node.tryGetContext('awsRegion') ?? 'eu-west-1';

new InfraStack(app, `${appName}-stack`, {
  env: { region, account: process.env.CDK_DEFAULT_ACCOUNT },
  appName,
});
