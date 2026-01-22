import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { S3Event, S3EventRecord } from "aws-lambda";
import { parse } from "csv-parse/sync";

const s3Client = new S3Client({});

export const main = async (event: S3Event | any): Promise<void> => {
    try {

        // Defensive checks: ensure event and Records exist
        if (!event || !event.Records || !Array.isArray(event.Records) || event.Records.length === 0) {
            console.error('TransformToJsonFunction received invalid event:', JSON.stringify(event));
            throw new Error('Invalid S3 event: missing Records');
        }

        console.warn('TransformToJsonFunction triggered with event:', JSON.stringify(event, null, 2));

        // log the record summary for quick debugging
        console.info(`S3 event record count=${event.Records.length}`);

        // 直接从事件记录中获取桶名和对象键
        const record = event.Records[0];
        console.info('TRANSFORMED_JSON_BUCKET=' + String(process.env.TRANSFORMED_JSON_BUCKET));
        const bucket = record?.s3?.bucket?.name;
        const keyRaw = record?.s3?.object?.key;
        if (!bucket || !keyRaw) {
            console.error('S3 record is missing bucket or object key:', JSON.stringify(record));
            throw new Error('Invalid S3 record: missing bucket or key');
        }
        const key = decodeURIComponent(keyRaw.replace(/\+/g, ' '));

        // 拿到上传成功事件后,就可以从S3获取对象内容了
        console.info(`Fetching S3 object from bucket=${bucket} key=${key}`);
        const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        
        //只有csv上传的事件才会触发该event,所以这里可以直接处理csv内容
        const csvData = await response.Body?.transformToString();
        if(!csvData) {
            console.error('Empty CSV data received from S3 object', { bucket, key, response });
            throw new Error("Failed to read CSV data from S3 object.");
        }
        console.info(`Received CSV data length=${csvData.length}`);

        // Parse CSV data with guarded error logging
        console.info('CSV preview (first 1000 chars):', csvData.slice(0, 1000));
        let records: any[] = [];
        try {
            records = parse(csvData, {
                columns: true,
                cast: (value: string, context: any) => {
                    try {
                        const lower = String(value).toLowerCase();
                        if (lower === 'true') return true;
                        if (lower === 'false') return false;
                        if (!isNaN(Number(value)) && ![
                            'customerId',
                            'locationId',
                            'address',
                            'city',
                            'state',
                            'postalCode',
                            'timestamp',
                        ].includes(String(context?.column ?? context?.columns ?? ''))) {
                            return parseFloat(value);
                        }
                        return value;
                    } catch (inner) {
                        console.warn('Cast function error, returning original value', { value, context, error: String(inner) });
                        return value;
                    }
                }
            });
        } catch (parseErr) {
            console.error('CSV parse failed', { error: String(parseErr) });
            // include a little more context to help debugging in CloudWatch
            console.error('CSV first line:', csvData.split('\n')[0]);
            throw parseErr;
        }
        if(!records.length) {
            console.error('Parsed CSV contains zero records', { key, recordsPreview: records.slice(0,3) });
            throw new Error('No records found in CSV data.');
        }
        console.info(`Parsed CSV records count=${records.length}`);


        //extract filename without extension
        const firstRecord = records[0];
        const timestamp = new Date(firstRecord.timestamp);
        const monthYear =  `${timestamp.getFullYear()}-${(timestamp.getMonth() + 1).toString().padStart(2, '0')}`;

        //创建对应的json file, 文件名格式: customerId/locationId/month-year/energy-data.json
        const jsonKey = `${records[0].customerId}/${records[0].locationId}/${monthYear}/energy-data.json`;
        console.info(`Will upload JSON to bucket=${process.env.TRANSFORMED_JSON_BUCKET} key=${jsonKey}`);

        //Upload JSON to S3, 该上传行为会触发后续的计算Lambda
        try {
            const putResponse = await s3Client.send(new PutObjectCommand({
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
            console.info('PutObject response', putResponse);
            console.log(`Successfully transformed csv to json and uploaded JSON to ${jsonKey}`);
        } catch (putErr) {
            console.error('Failed to upload JSON to S3', putErr);
            throw putErr;
        }

    } catch (error) {
        console.error("Error processing S3 event:", error);
        throw error;    
    }
}


