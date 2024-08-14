import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ImageMetadata } from '../schemas/image-metadata.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Session } from '../schemas/session.schema';
import { S3Service } from './s3.service';
import { ImageMetadataInterface } from '../interfaces';
import { v1 as uuidv1 } from 'uuid';

@Injectable()
export class ImageService {
    private readonly logger = new Logger(ImageService.name);
    private imageMetadaJob: string;

    constructor(
        private readonly s3Service: S3Service,
        @InjectModel(ImageMetadata.name) private imageMetadataModel: Model<ImageMetadata>,
        @InjectModel(Session.name) private sessionModel: Model<Session>,
        @Inject('ImageMetadataQueue') private readonly imageMetadaQueue: Queue,
        private readonly configService: ConfigService
    ) {
        this.imageMetadaJob = this.configService.get('IMAGE_METADATA_JOB');
    }

    async uploadImageToS3AndSaveMetadata(file: Express.Multer.File, sessionId: string): Promise<ImageMetadataInterface> {
        this.logger.log(`Starting upload for image ${file.originalname} in session ${sessionId}`);
        const imageId = uuidv1();
        try {
            const imageUrl = await this.s3Service.uploadFile(file, sessionId, imageId);
            const imageMetada: ImageMetadataInterface = { 
                filename: file.originalname,
                filetype: file.mimetype,
                filesize: file.size,
                imageId,
                imageUrl,
            };
            const imageMetadaWithSessionId = { ...imageMetada, sessionId };
            // const imageMetadataModel = new this.imageMetadataModel();
            await this.imageMetadataModel.create(imageMetadaWithSessionId);

            this.logger.log(`Successfully uploaded image ${file.originalname} with ID ${imageId}`);
            return imageMetada;
        } catch (error) {
            this.logger.error(`Failed to upload image ${file.originalname} for session ${sessionId}`);
            throw new InternalServerErrorException(`Failed to upload image ${file.originalname}`, error.stack);
        }
    }

    async uploadAndQueueImageMetada(files: Array<Express.Multer.File>, sessionId: string) {
        this.logger.log(`Starting upload and queue for session ${sessionId}`);
        try {
            const startTime = Date.now()
            const session = await this.sessionModel.findOne({ sessionId });
            if (!session) {
                this.logger.warn(`Invalid session ${sessionId}`);
                throw new BadRequestException(`Invalid Session`);
            }

            const uploadPromises = files.map(file => this.uploadImageToS3AndSaveMetadata(file, sessionId));
            const metadata = await Promise.all(uploadPromises);

            await this.imageMetadaQueue.add(this.imageMetadaJob,
                { sessionId, metadata, startTime }, 
                { attempts: 3,
                    backoff: {
                        type: "exponential",
                        delay: 1000
                    }
                }
            );

            this.logger.log(`Successfully queued metadata for session ${sessionId}`);
            return metadata;
        } catch (error) {
            this.logger.error(`Failed to upload and queue metadata for session ${sessionId}`);
            if (error instanceof BadRequestException) {
                throw error
            }
            throw new InternalServerErrorException(`Failed to upload and queue metadata for session ${sessionId}`);
        }
    }

    async totalImagesPerSession(sessionId: string) {
        this.logger.log(`Counting total images for session ${sessionId}`);
        try {
            const count = await this.imageMetadataModel.countDocuments({ sessionId });
            this.logger.log(`Total images for session ${sessionId}: ${count}`);
            return count;
        } catch (error) {
            this.logger.error(`Failed to count images for session ${sessionId}`);
            throw new InternalServerErrorException(`Failed to count images for session ${sessionId}`);
        }
    }
}