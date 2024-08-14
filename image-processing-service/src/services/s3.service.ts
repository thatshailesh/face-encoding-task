import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
    private readonly s3Client: S3Client
    private bucketName: string

    constructor(
        private readonly configService: ConfigService
    ) {
        this.bucketName = this.configService.get('S3_BUCKET_NAME')
        this.s3Client = new S3Client({ 
            region: this.configService.get('S3_region'),
            credentials: {
                accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
                secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY') 
            }
        });
    }

    async getFile(fileKey: string) {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: fileKey,
        });

        return this.s3Client.send(command);
    }

    async uploadFile(encodings: number[][], sessionId: string, imageId: string, filename: string): Promise<{imageId: string, encodingfileKey: string, filename: string}> {
        const encodingfileKey = `sessions/${sessionId}/${imageId}/encodings.json`;
        const body = JSON.stringify({encodings});
        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: encodingfileKey,
            Body: body
        });
        await this.s3Client.send(command);
        return {
            imageId,
            encodingfileKey,
            filename
        };
    }
}
