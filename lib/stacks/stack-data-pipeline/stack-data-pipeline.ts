import * as cdk from "aws-cdk-lib";
import { aws_s3 as s3 } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { aws_s3_notifications as s3n } from "aws-cdk-lib";
import { aws_sns as sns } from "aws-cdk-lib";
import { aws_sns_subscriptions as snsSubscriptions } from "aws-cdk-lib";
import * as path from "path";
import { SharedResourcesStack } from "../stack-shared-resources/stack-shared-resources";

export interface DataPipelineStackProps extends cdk.StackProps {

  readonly calculatedEnergyTable: cdk.aws_dynamodb.Table;

  readonly adminEmailAddress: string;

  readonly sharedResourcesStack: SharedResourcesStack;
}

/**
 * The stack class extends the base CDK Stack
 */
export class DataPipelineStack extends cdk.Stack {
  
  public readonly rawDataBucket: s3.Bucket;

  public readonly jsonTransformedBucket: s3.Bucket;

  public readonly snsTopicRawUpload: sns.Topic;

  public readonly snsTopicCalculatorSummary: sns.Topic;

  public readonly transformToJsonLambdaFunction: lambda.Function;

  public readonly calculateAndNotifyLambdaFunction: lambda.Function;

  public readonly processedDataBucket: s3.Bucket;

  constructor(scope: cdk.App, id: string, props: DataPipelineStackProps) {
    super(scope, id, props);

    this.rawDataBucket = new s3.Bucket(this, "RawDataBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.jsonTransformedBucket = new s3.Bucket(this, "JsonTransformedBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
    });

    this.snsTopicRawUpload = new sns.Topic(this, "SnsTopicRawUpload", {
      displayName: "Home energy coach raw data upload notifications",
    });

    this.snsTopicRawUpload.addSubscription(
      new snsSubscriptions.EmailSubscription(props.adminEmailAddress)
    );

    this.snsTopicCalculatorSummary = new sns.Topic(this, "SnsTopicCalculatorSummary", {
      displayName: "Home energy coach calculation summary notifications",
    });

    this.snsTopicCalculatorSummary.addSubscription(
      new snsSubscriptions.EmailSubscription(props.adminEmailAddress)
    );

    this.transformToJsonLambdaFunction = new NodejsFunction(this, 'TransformToJsonFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, './lambda/lambda-transform-to-json/index.ts'),
      handler: 'main',
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: {
        TRANSFORMED_JSON_BUCKET: this.jsonTransformedBucket.bucketName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        sourceMap: true,
      },
      description: 'lambda function that transforms raw energy data files to JSON format and save to S3',
    });

    this.calculateAndNotifyLambdaFunction = new NodejsFunction(this, 'CalculateAndNotifyFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, './lambda/lambda-calculate-notify/index.ts'),
      handler: 'main',
      environment: {
        SNS_TOPIC_CALCULATOR_SUMMARY: this.snsTopicCalculatorSummary.topicArn,
        CALCULATED_ENERGY_TABLE_NAME: props.calculatedEnergyTable.tableName,
        CALCULATED_ENERGY_TABLE: props.calculatedEnergyTable.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        sourceMap: true,
      },
      description: 'lambda function that calculates energy usage from JSON data and notifies users via SNS',
    });

    this.rawDataBucket.grantRead(this.transformToJsonLambdaFunction);
    this.jsonTransformedBucket.grantWrite(this.transformToJsonLambdaFunction);
    this.jsonTransformedBucket.grantRead(this.calculateAndNotifyLambdaFunction);
    props.calculatedEnergyTable.grantReadWriteData(this.calculateAndNotifyLambdaFunction);
    
    // Grant SNS publish permission to calculateAndNotifyLambdaFunction
    this.snsTopicCalculatorSummary.grantPublish(this.calculateAndNotifyLambdaFunction);

    this.rawDataBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.transformToJsonLambdaFunction),
      {suffix: '.csv'}
    );

    this.rawDataBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(this.snsTopicRawUpload),
      {suffix: '.csv.notify'}
    );

    this.jsonTransformedBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.calculateAndNotifyLambdaFunction),
      {suffix: '.json'}
    );

    this.processedDataBucket = new s3.Bucket(this, "ProcessedDataBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
    });

    new cdk.CfnOutput(this, "RawDataBucketName", {
      value: this.rawDataBucket.bucketName,
      description: "The name of the S3 bucket for raw data csv uploads",
    });
    new cdk.CfnOutput(this, "JsonTransformedBucketName", {
      value: this.jsonTransformedBucket.bucketName,
      description: "The name of the S3 bucket for transformed JSON data",
    });
    new cdk.CfnOutput(this, "SnsTopicRawUploadArn", {
      value: this.snsTopicRawUpload.topicArn,
      description: "The ARN of the SNS topic for raw data upload notifications",
    });
    new cdk.CfnOutput(this, "SnsTopicCalculatorSummaryArn", { 
      value: this.snsTopicCalculatorSummary.topicArn,
      description: "The ARN of the SNS topic for calculation summary notifications",
    });
    }
  }
