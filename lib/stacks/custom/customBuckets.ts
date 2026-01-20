import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';


export interface MyBucketProps {

    /**
     * The name of the S3 bucket
     */
    readonly bucketName: string;

    /**
     *  Whether to enable versioning on the bucket
     */
    readonly versioned?: boolean;

    /**
     * The removal policy for the bucket
     */
    readonly removalPolicy?: cdk.RemovalPolicy;
}

export class MyBucket extends Construct {
    public readonly bucket: s3.Bucket;

    constructor(scope: Construct, id: string, props: MyBucketProps) {
        super(scope, id);

        this.bucket = new s3.Bucket(this, 'MyBucket', {
            bucketName: props.bucketName,
            versioned: props.versioned ?? false,
            removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
        });
    }
}   

export class CustomBucketsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create a standard S3 bucket
    new s3.Bucket(this, 'StandardBucket', {
      bucketName: `standard-bucket-${Date.now()}`,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create an S3 bucket with server access logging enabled
    const loggingBucket = new s3.Bucket(this, 'LoggingBucket', {
      bucketName: `logging-bucket-${Date.now()}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new s3.Bucket(this, 'AccessLoggingBucket', {
      bucketName: `access-logging-bucket-${Date.now()}`,
      serverAccessLogsBucket: loggingBucket,
      serverAccessLogsPrefix: 'access-logs/',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }
}   