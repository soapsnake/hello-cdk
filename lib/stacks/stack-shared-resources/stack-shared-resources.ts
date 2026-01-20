import * as cdk from 'aws-cdk-lib';
import { aws_s3 as  s3 } from 'aws-cdk-lib';
import { aws_sns as sns } from 'aws-cdk-lib';
import { aws_sns_subscriptions as subscriptions } from 'aws-cdk-lib';


export interface StackSharedResourcesProps extends cdk.StackProps {
  // Define any additional properties if needed
  readonly adminEmailAddress: string;
}

export class SharedResourcesStack extends cdk.Stack {
  public readonly rawDataUploadS3Bucket: s3.Bucket;
  public readonly snsRawDataUploadTopic: sns.Topic;
  public readonly snsCalculatorSummaryTopic: sns.Topic;

  constructor(scope: cdk.App, id: string, props?: StackSharedResourcesProps) {
    super(scope, id, props);

    // Create a shared S3 bucket
    this.rawDataUploadS3Bucket = new s3.Bucket(this, 'rawDataUploadS3Bucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(1),
        },
      ],
    });

    // Create a shared SNS topic
    this.snsRawDataUploadTopic = new sns.Topic(this, 'snsRawDataUploadTopic', {
      displayName: 'home energy coach raw data upload topic',
    });
    
    this.snsRawDataUploadTopic.addSubscription(
      new subscriptions.EmailSubscription(props?.adminEmailAddress || '')
    );

    // Create calculator SNS topic
    this.snsCalculatorSummaryTopic = new sns.Topic(this, 'snsCalculatorSummaryTopic', {
      displayName: 'home energy coach calculator topic',
    });

    this.snsCalculatorSummaryTopic.addSubscription(
      new subscriptions.EmailSubscription(props?.adminEmailAddress || '')
    );  
  }
}