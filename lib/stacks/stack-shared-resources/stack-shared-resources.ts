import * as cdk from 'aws-cdk-lib';
import { aws_s3 as  s3 } from 'aws-cdk-lib';
import { aws_sns as sns } from 'aws-cdk-lib';
import { aws_sns_subscriptions as subscriptions } from 'aws-cdk-lib';
import { aws_dynamodb } from 'aws-cdk-lib';

export interface StackSharedResourcesProps extends cdk.StackProps {

  readonly stage?: string;
}

export class SharedResourcesStack extends cdk.Stack {

  public readonly calculatedEnergyTable: aws_dynamodb.Table;

  constructor(scope: cdk.App, id: string, props?: StackSharedResourcesProps) {
    super(scope, id, props);

    const stage = props?.stage ?? "dev";

    this.calculatedEnergyTable = new aws_dynamodb.Table(
      this, 
      'CalculatedEnergyTable', 
      {
        partitionKey: { name: 'customerId', type: aws_dynamodb.AttributeType.STRING },
        sortKey: { name: 'timestamp', type: aws_dynamodb.AttributeType.STRING },
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,  
        timeToLiveAttribute: 'ttl',
        pointInTimeRecovery: true,
      }
  );

    this.calculatedEnergyTable.addGlobalSecondaryIndex({
      indexName: 'CustomerLocationIndex',
      partitionKey: { name: 'customerId', type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'locationId', type: aws_dynamodb.AttributeType.STRING },
      projectionType: aws_dynamodb.ProjectionType.ALL,
    });

    new cdk.CfnOutput(this, 'CalculatedEnergyTableName', {
      value: this.calculatedEnergyTable.tableName,
      description: 'The name of the DynamoDB table for calculated energy usage',
    });
  }
}