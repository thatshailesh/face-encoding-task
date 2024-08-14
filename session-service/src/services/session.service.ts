import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session } from '../schemas/session.schema';
import { Job, Queue, Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { ImagesMetadaInterface } from 'src/interfaces';
import { S3Service } from './s3.service';

@Injectable()
export class SessionService implements OnModuleInit {
    private readonly logger = new Logger(SessionService.name);
    private sessionSummaryJob: string;
    private sessionSummaryQueueWorker: Worker;
    private sessionSummaryQueueName: string;
    private workerConcurrency: number;

    constructor(
        @InjectModel(Session.name) private sessionModel: Model<Session>,
        @Inject('SessionSummaryQueue') private readonly sessionSummaryQueue: Queue,
        private readonly configService: ConfigService,
        private readonly s3Service: S3Service
    ) {
        this.sessionSummaryQueueName = this.configService.get('SESSION_SUMMARY_QUEUE');
        this.sessionSummaryJob = this.configService.get('SESSION_SUMMARY_JOB');
        this.workerConcurrency = Number(this.configService.get('WORKERS_CONCURRENCY'))
    }

    onModuleInit() {
        this.initializeSessionSummaryQueueWorker();
    }

    private initializeSessionSummaryQueueWorker() {
        this.sessionSummaryQueueWorker = new Worker(this.sessionSummaryQueueName,
            async (job: Job) => {
                try {
                    if (job.name === this.sessionSummaryJob) {
                        await this.processSessionSummaryEventsAndSave(job);
                    }
                } catch (error) {
                    this.logger.error(`Error processing job ${job.id}:`, error.stack);
                    throw error; // Ensure the error is propagated
                }
            }, {
                connection: this.sessionSummaryQueue.opts.connection,
                concurrency: this.workerConcurrency
            }
        );

        this.sessionSummaryQueueWorker.on('failed', (job, err) => {
            this.logger.error(`Job ${job.id} failed with error: ${err.message}`, err.stack);
        });

        this.sessionSummaryQueueWorker.on('completed', (job) => {
            this.logger.log(`Job ${job.id} completed successfully`);
        });
    }

    async processSessionSummaryEventsAndSave(job: { data: { sessionId: string, imagesMetada: ImagesMetadaInterface } }) {
        const { sessionId, imagesMetada } = job.data;
        this.logger.log(`Processing session summary for session ${sessionId}`);
        try {
            await this.saveSessionSummary(sessionId, imagesMetada);
            this.logger.log(`Successfully processed session summary for session ${sessionId}`);
        } catch (error) {
            this.logger.error(`Failed to process session summary for session ${sessionId}`, error.stack);
            throw error;
        }
    }

    async saveSessionSummary(sessionId: string, imagesMetada: ImagesMetadaInterface) {
        this.logger.log(`Saving session summary for session ${sessionId}`);
        try {
            const result = await this.sessionModel.updateOne(
                { sessionId },
                { $push: { imagesMetada: { $each: imagesMetada } } },
                { upsert: true },
            ).exec();
            this.logger.log(`Successfully saved session summary for session ${sessionId}`);
            return result;
        } catch (error) {
            this.logger.error(`Failed to save session summary for session ${sessionId}`, error.stack);
            throw new InternalServerErrorException(`Failed to save session summary for session ${sessionId}`);
        }
    }

    async createSession(): Promise<Session> {
        this.logger.log(`Creating a new session`);
        try {
            const newSession = new this.sessionModel();
            const result = await newSession.save();
            this.logger.log(`Successfully created a new session with ID ${result.sessionId}`);
            return result;
        } catch (error) {
            this.logger.error(`Failed to create a new session`, error.stack);
            throw new InternalServerErrorException(`Failed to create a new session`);
        }
    }

    async getSessionSummary(sessionId: string) {
        this.logger.log(`Fetching session summary for session ${sessionId}`);
        try {
            const sessionData = await this.sessionModel.findOne({ sessionId });
            if (!sessionData) {
                this.logger.warn(`Session ${sessionId} does not exist`);
                throw new NotFoundException('Session does not exist');
            }

            const summaries = await Promise.all(sessionData.imagesMetada.map(async (metadata) => {
                const key = metadata.encodingfileKey;
                const imageId = metadata.imageId;
                const filename = metadata.filename;
                if (metadata.encodingfileKey === "") {
                    return { imageId, filename, encodings: [] };    
                }
                const result = await this.s3Service.getFile(key);
                return { imageId, filename, encodings: result.encodings };
            }));

            this.logger.log(`Successfully fetched session summary for session ${sessionId}`);
            return { sessionId, summaries };
        } catch (error) {
            this.logger.error(`Failed to fetch session summary for session ${sessionId}`, error.stack);
            throw new InternalServerErrorException(`Failed to fetch session summary for session ${sessionId}`);
        }
    }
}