import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { S3Event, S3EventRecord } from "aws-lambda";
import { parse } from "csv-parse/sync";

const s3Client = new S3Client({});

export const main = async (event: S3Event): Promise<void> => {
    try {

        // 直接从事件记录中获取桶名和对象键
        const bucket = event.Records[0].s3.bucket.name;
        const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

        // 拿到上传成功事件后,就可以从S3获取对象内容了
        const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        
        //只有csv上传的事件才会触发该event,所以这里可以直接处理csv内容
        const csvData = await response.Body?.transformToString();
        if(!csvData) {
            throw new Error("Failed to read CSV data from S3 object.");
        }

        //Parse CSV data
        const records: any[] = parse(csvData, {
            columns: true,
            cast: (value: string, context: any) => {
                if(value.toLowerCase() === 'true') return true;
                if(value.toLowerCase() === 'false') return false;
                if(!isNaN(Number(value)) && ![
                    "customerId",
                    "locationId",
                    "address",
                    "city",
                    "state",
                    "postalCode",
                    "timestamp",
                ].includes(context.columns as string)) {
                    return parseFloat(value);
                }
                return value;
            }
        });
        if(!records.length) throw new Error("No records found in CSV data.");


        //extract filename without extension
        const firstRecord = records[0];
        const timestamp = new Date(firstRecord.timestamp);
        const monthYear =  `${timestamp.getFullYear()}-${(timestamp.getMonth() + 1).toString().padStart(2, '0')}`;

        //创建对应的json file, 文件名格式: customerId/locationId/month-year/energy-data.json
        const jsonKey = `${records[0].customerId}/${records[0].locationId}/${monthYear}/energy-data.json`;

        //Upload JSON to S3, 该上传行为会触发后续的计算Lambda
        await s3Client.send(new PutObjectCommand({
            Bucket: process.env.TRANSFORMED_JSON_BUCKET!,
            Key: jsonKey,
            Body: JSON.stringify(records, null, 2),
            ContentType: "application/json",
            Metadata: {
                customerId: records[0].customerId,
                locationId: records[0].locationId,
                month: monthYear,
                recordCount:  records.length.toString(),
            },
        }));

        console.log(`Successfully transformed csv to json and uploaded JSON to ${jsonKey}`);

    } catch (error) {
        console.error("Error processing S3 event:", error);
        throw error;    
    }
}

module.exports = { main };

