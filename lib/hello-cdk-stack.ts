import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { aws_lambda as lambda } from 'aws-cdk-lib';
import path from 'path';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class HelloCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    const HelloCdkLambda = new lambda.Function(this, 'HelloCdkHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      handler: 'index.handler',
    });
  }
}
