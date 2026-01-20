import * as cdk from "aws-cdk-lib";
import { aws_s3 as s3 } from "aws-cdk-lib";
import { aws_lambda as lambda } from "aws-cdk-lib";
import { aws_s3_notifications as s3n } from "aws-cdk-lib";
import { aws_sns as sns } from "aws-cdk-lib";
import * as path from "path";

export interface DataPipelineStackProps extends cdk.StackProps {
  readonly rawDataLandingBucket: s3.Bucket;
  readonly snsTopicRawUpload: sns.Topic;
  readonly snsTopicCalculatorSummary: sns.Topic;
}

/**
 * The stack class extends the base CDK Stack
 */
export class DataPipelineStack extends cdk.Stack {
  /**
   * Constructor for the stack
   * @param {cdk.App} scope - The CDK application scope
   * @param {string} id - Stack ID
   * @param {DataPipelineStackProps} props - Data pipeline stack properties
   */
  constructor(scope: cdk.App, id: string, props: DataPipelineStackProps) {
    // Call super constructor
    super(scope, id, props);

    // Create S3 bucket to store transformed JSON
    const jsonTransformedBucket = new s3.Bucket(this, "JsonTransformedBucket", {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Lambda function to transform CSV to JSON
    const transformToJsonLambdaFunction = new lambda.Function(
      this,
      "TransformToJsonLambdaFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.main",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "./lambda/lambda-transform-to-json")
        ),
        environment: {
          TRANSFORMED_BUCKET: jsonTransformedBucket.bucketName,
          AWS_REGION: cdk.Stack.of(this).region,
        },
        description:
          "Lambda function transforms CSV to JSON and saves to S3 bucket",
      }
    );

    // Create Lambda function to calculate energy usage and notify
    const calculateAndNotifyLambdaFunction = new lambda.Function(
      this,
      "CalculateAndNotifyLambdaFunction",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.main",
        code: lambda.Code.fromAsset(
          path.join(__dirname, "./lambda/lambda-calculate-notify")
        ),
        environment: {
          SNS_TOPIC_CALCULATOR_SUMMARY: props.snsTopicCalculatorSummary.topicArn,
          AWS_REGION: cdk.Stack.of(this).region,
        },
        description:
          `
          Lambda function calculates
          total energy usage and sends
          a summary notification via SNS
          `,
      }
    );

    // Grant permissions for Lambda functions
    props.rawDataLandingBucket.grantRead(transformToJsonLambdaFunction);
    jsonTransformedBucket.grantWrite(transformToJsonLambdaFunction);
    jsonTransformedBucket.grantRead(calculateAndNotifyLambdaFunction);

    // Add event notification to trigger CSV transformation on .csv files
    props.rawDataLandingBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(props.snsTopicRawUpload),
      { suffix: ".csv" }
    );

    // Add event notification to trigger calculation on .json files
    props.rawDataLandingBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(calculateAndNotifyLambdaFunction),
      { suffix: ".json" }
    );

    // Output S3 bucket names for reference
    new cdk.CfnOutput(this, "RawDataLandingBucketName", {
      value: props.rawDataLandingBucket.bucketName,
    });

    new cdk.CfnOutput(this, "JsonTransformedBucketName", {
      value: jsonTransformedBucket.bucketName,
    });

  }
}
