#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import LambdaStack from '../lib/lambda-stack';
import { loadConfig } from '../lib/config';

const app = new cdk.App();

const envName = app.node.tryGetContext('env') || 'dev';
const appConfig = loadConfig(envName);

// Use configured stack name or default to appName + 'Stack'
const stackName = appConfig.stackName || `${appConfig.appName}Stack`;

new LambdaStack(app, stackName, {
  env: {
    account: appConfig.account,
    region: appConfig.region,
  },
  config: appConfig,
  description: `${appConfig.appName} serverless application infrastructure for ${appConfig.environment} environment`,
});

app.synth();