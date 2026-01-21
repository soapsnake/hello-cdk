import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Event } from "aws-lambda";
import { json } from "stream/consumers";
import { CfnLocationFSxWindows } from "aws-cdk-lib/aws-datasync";
import { deepEqual } from "assert";

const s3Client = new S3Client({});
const snsClient = new SNSClient({});
const dynamoClient = new DynamoDBClient({});

interface Location {
    locationId: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
}

interface EnergyUsageRecord {
    customerId: string;
    customerName: string;
    locationId: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    timestamp: string;
    kWh: number;
    outsideTemp: number;
    electricVehicleCharging: boolean;
    hotWaterHeater: boolean;
    poolPump: boolean;
    heatPump: boolean;
}

export const main = async (event: S3Event): Promise<void> => {
    try {   

        const bucket = event.Records[0].s3.bucket.name;
        const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

        //get the json from s3
        const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const jsonData = await response.Body?.transformToString();
        if(!jsonData) {
            throw new Error("Failed to read JSON data from S3 object.");
        }

        const data = JSON.parse(jsonData) as EnergyUsageRecord[];
        if(!data.length) {
            throw new Error("No records found in JSON data.");
        }

        const firstReading = data[0];
        const firstDate = new Date(firstReading.timestamp);
        const monthYear =  `${firstDate.getFullYear()}-${(firstDate.getMonth() + 1).toString().padStart(2, '0')}`;

        const customerInfo = {
            customerId: firstReading.customerId,
            customerName: firstReading.customerName,
        };
        const locationInfo = {
            locationId : firstReading.locationId,
            address: firstReading.address,
            city: firstReading.city,
            state: firstReading.state,
            postalCode: firstReading.postalCode,
        };

        const primaryKey = `${customerInfo.customerId}#${locationInfo.locationId}#${monthYear}`;

        let shouldUpdate = true;
        const existingItem = await dynamoClient.send(new GetItemCommand({
            TableName: process.env.CALCULATED_ENERGY_TABLE_NAME!,
            Key: {
                "PrimaryKey": { S: primaryKey },
            },
        }));

        const summary = calculateSummary(data);

        if(existingItem.Item) {
            const existingSummary = JSON.parse(existingItem.Item.Summary.S!);
            shouldUpdate = !realEqual(existingSummary, summary)
        }

        if(shouldUpdate) {
            await dynamoClient.send(new PutItemCommand({
                TableName: process.env.CALCULATED_ENERGY_TABLE_NAME!,
                Item: { 
                    primaryKey: { S: primaryKey },
                    timestamp: { S: new Date().toISOString() },
                    CustomerId: { S: customerInfo.customerId },
                    CustomerName: { S: customerInfo.customerName },
                    locationId: { S: locationInfo.locationId },
                    address: { S: locationInfo.address },
                    city: { S: locationInfo.city },
                    state: { S: locationInfo.state },
                    postalCode: { S: locationInfo.postalCode },
                    summary: { S: JSON.stringify(summary) },
                    rawData: { S: jsonData },
                }
            }));    

            await snsClient.send(new PublishCommand({
            TopicArn: process.env.SNS_TOPIC_CALCULATOR_SUMMARY!,
            Subject: `Energy Usage Summary for ${customerInfo.customerName} - ${monthYear}`,
            Message: JSON.stringify({
                location:locationInfo,
                month: monthYear,
                summary,
                status: existingItem.Item ? "UPDATED" : "NEW"
            },
            null,
            2),
        }));
        console.log(
        `Successfully ${
          existingItem.Item ? "updated" : "created"
        } summary for ${locationInfo.address} - ${monthYear}`
      );
        } else {
            console.log(
                `No changes detected for ${locationInfo.address} - ${monthYear}, skipping update.`
            );
        }
    } catch (error) {
        console.error("Error processing S3 event:", error);
        throw error;
    }
}

function calculateSummary(data: EnergyUsageRecord[]) {
    const summary = {
        period: {
            start: data[0].timestamp,
            end: data[data.length - 1].timestamp,
        },
        totalKwh: 0,
        averages: {
            daily: 0,
            byHour: new Array(24).fill(0),
            temperature: 0,
        },
        deviceUsage: {
            evChargingHours: 0,
            hotWaterHeaterHours: 0,
            poolPumpHours: 0,
            heatPumpHours: 0,
        },
        peakUsage: {
            value: 0,
            timestamp: "",
            temperature: 0,
        },
    };

    data.forEach((record) => {
        summary.totalKwh += record.kWh;
        summary.averages.temperature += record.outsideTemp;

        const hour = new Date(record.timestamp).getHours();
        summary.averages.byHour[hour] += record.kWh;
    
        if(record.kWh > summary.peakUsage.value) {
            summary.peakUsage = {
                value: record.kWh,
                timestamp: record.timestamp,
                temperature: record.outsideTemp,
            };
        };
        
        if(record.electricVehicleCharging) summary.deviceUsage.evChargingHours += 1;
        if(record.hotWaterHeater) summary.deviceUsage.hotWaterHeaterHours += 1;
        if(record.poolPump) summary.deviceUsage.poolPumpHours += 1;
        if(record.heatPump) summary.deviceUsage.heatPumpHours += 1;
    });

    const days = Math.ceil(data.length / 24);
    summary.averages.daily = summary.totalKwh / days;
    summary.averages.temperature /= data.length;
    summary.averages.byHour = summary.averages.byHour.map((totalKwh) => totalKwh / days);

    return {
        ...summary
        }
    }

function realEqual(obj1: any, obj2: any): boolean { 
    if(obj1 === obj2) return true;
    if(typeof obj1 !== "object" || typeof obj2 !== "object" || obj1 === null || obj2 === null) {
        return false;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if(keys1.length !== keys2.length) return false;
    return keys1.every((key) => deepEqual(obj1[key], obj2[key]));
}
 module.exports = { main };
 