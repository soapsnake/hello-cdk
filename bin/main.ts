#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { HelloCdkStack } from '../lib/stacks/stack-data-pipeline/stack-data-pipeline';

const app = new cdk.App();
new HelloCdkStack(app, 'HelloCdkStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
