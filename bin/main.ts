#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { SharedResourcesStack } from '../lib/stacks/stack-shared-resources/stack-shared-resources';
import { DataPipelineStack } from '../lib/stacks/stack-data-pipeline/stack-data-pipeline';
import dotenv from 'dotenv';

// Load local .env if present (local dev only)
dotenv.config();

const appEnv: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();

function checkRequiredContext(app: cdk.App, key: string): void {
  const contextValue = app.node.tryGetContext(key);
  if (!contextValue) {
    console.error(`Missing required context parameter: ${key}. Please provide it via environment variable or -c ${key}=value`);
    process.exit(1);
  }
}

// Prefer environment variables, then existing context (treat empty string as set but invalid)
const deployment = process.env.DEPLOYMENT !== undefined ? process.env.DEPLOYMENT : (app.node.tryGetContext('deployment') || 'dev');
const environment = process.env.ENVIRONMENT !== undefined ? process.env.ENVIRONMENT : (app.node.tryGetContext('environment') || 'dev');
const adminEmailAddress = process.env.ADMIN_EMAIL !== undefined
  ? process.env.ADMIN_EMAIL
  : (app.node.tryGetContext('adminEmailAddress') ?? '');
const identityCenterInstanceArn = process.env.IDENTITY_CENTER_INSTANCE_ARN !== undefined
  ? process.env.IDENTITY_CENTER_INSTANCE_ARN
  : (app.node.tryGetContext('identityCenterInstanceArn') ?? '');

// Ensure app context contains the resolved values so stacks using app.node.tryGetContext(...) will see them
app.node.setContext('deployment', deployment);
app.node.setContext('environment', environment);
app.node.setContext('adminEmailAddress', adminEmailAddress);
app.node.setContext('identityCenterInstanceArn', identityCenterInstanceArn);

// Validate required keys and ensure non-empty (empty string is invalid)
if (!environment) {
  console.error('`environment` is required and cannot be empty. Provide via ENVIRONMENT or -c environment=value');
  process.exit(1);
}
if (!identityCenterInstanceArn) {
  console.error('`identityCenterInstanceArn` is required and cannot be empty. Provide via IDENTITY_CENTER_INSTANCE_ARN or -c identityCenterInstanceArn=value');
  process.exit(1);
}
if (!adminEmailAddress) {
  console.error('`adminEmailAddress` is required and cannot be empty. Provide via ADMIN_EMAIL or -c adminEmailAddress=value');
  process.exit(1);
}

const defaultStackProps: cdk.StackProps = {
  env: appEnv,
  description: `home energy coach application(created by ${adminEmailAddress})`,
  tags: {
    Environment: deployment,
    project: 'HomeEnergyCoach',
  },
};

const sharedResourcesStack = new SharedResourcesStack(app, 'SharedResourcesStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

const dataPipelineStack = new DataPipelineStack(app, 'DataPipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  sharedResourcesStack,
  calculatedEnergyTable: sharedResourcesStack.calculatedEnergyTable,
  adminEmailAddress: adminEmailAddress,
});

dataPipelineStack.addDependency(sharedResourcesStack);

app.synth();


