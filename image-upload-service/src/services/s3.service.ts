import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

    async uploadFile(file: Express.Multer.File, sessionId: string, imageId: string): Promise<string> {
        const fileKey = `sessions/${sessionId}/${imageId}/${file.originalname}`;
        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileKey,
            Body: file.buffer,
        });
        await this.s3Client.send(command);
        return fileKey;
    }
}
