import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
        //* Generate a pre-signed URL
        const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 60 });

        //* Use fetch API to download the file
        const response = await fetch(signedUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const jsonData = await response.json();
        return jsonData;
    }
}
