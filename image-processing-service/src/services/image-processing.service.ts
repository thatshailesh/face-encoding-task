import { Inject, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import axios from 'axios';
import * as FormData from 'form-data';
import { ConfigService } from '@nestjs/config';
import { SessionData } from '../interfaces';
import { S3Service } from './s3.service';

@Injectable()
export class ImageProcessingService implements OnModuleInit {
	private readonly logger = new Logger(ImageProcessingService.name);
	private imageQueueWorker: Worker;
	private bucketName: string;
	private faceEncodingServiceUrl: string;
	private imageMetadaQueueName: string;
	private imageMetadaJob: string;
	private sessionSummaryJob: string;
	private workerConcurrency: number;

	constructor(
		@Inject('ImageMetadataQueue') private readonly imageMetadaQueue: Queue,
		@Inject('SessionSummaryQueue') private readonly SessionSummaryQueue: Queue,
		private readonly configService: ConfigService,
		private readonly s3Service: S3Service
	) {
		this.bucketName = this.configService.get('S3_BUCKET_NAME');
		this.faceEncodingServiceUrl = this.configService.get('FACE_ENCODING_SERVICE_URL');
		this.imageMetadaQueueName = this.configService.get('IMAGE_METADATA_QUEUE');
		this.imageMetadaJob = this.configService.get('IMAGE_METADATA_JOB');
		this.sessionSummaryJob = this.configService.get('SESSION_SUMMARY_JOB');
		this.workerConcurrency = Number(this.configService.get('WORKERS_CONCURRENCY'))
	}

	onModuleInit() {
		this.initializeImageQueueWorker();
	}

	private initializeImageQueueWorker() {
		this.imageQueueWorker = new Worker(this.imageMetadaQueueName, 
			async (job: Job) => {
				try {
					if (job.name === this.imageMetadaJob) {
						await this.processImageEventsAndQueueEncodings(job.data, job.id);
					}
				} catch (error) {
					this.logger.error(`Error processing job ${job.id}:`, error.stack);
					throw error; // Ensure the error is propagated
				}
			}, {
				connection: this.imageMetadaQueue.opts.connection,
				concurrency: this.workerConcurrency
			}
		);

		this.imageQueueWorker.on('failed', (job, err) => {
			this.logger.error(`Job ${job.id} failed with error: ${err.message}`, err.stack);
		});

		this.imageQueueWorker.on('completed', (job) => {
			this.logger.log(`Job ${job.id} completed successfully`);
		});
	}

	async processImageEventsAndQueueEncodings(data: SessionData, id: string) {
		this.logger.log(`Processing job ${id} with data: ${JSON.stringify(data)}`);
		try {
			//* Parallelize image downloads
			const downloadPromises = data.metadata.map(async data => {
				const fullUrl = `https://${this.bucketName}.s3.amazonaws.com/${data.imageUrl}`;
				const response = await axios.get(fullUrl, { responseType: 'arraybuffer' });
				return { buffer: response.data, filename: data.filename, imageId: data.imageId };
			});
			const images = await Promise.all(downloadPromises);
	
			//* Encode faces one by one
			const faceEncodings = await Promise.all(images.map(async (image) => {
				const formData = new FormData();
				formData.append('file', image.buffer, { filename: image.filename });
				const encoding = await this.encodeFaces(formData);
				return { image, encoding };
			}));
	
			//* Parallelize uploads
			const uploadPromises = faceEncodings.map(async ({ image, encoding }) => {
				if (encoding.length > 0) {
					return this.s3Service.uploadFile(encoding[0], data.sessionId, image.imageId, image.filename);
				}
				return {
					imageId: image.imageId,
					encodingfileKey: '',
					filename: image.filename
				};
			});
			const uploadResult = await Promise.all(uploadPromises);
			const endTime = Date.now()
			const timeDiff = endTime - data.startTime;
			const timeElapsed = new Date(timeDiff).toISOString().slice(11, 19);
			this.logger.debug(`Total time taken taken for sessionId ${data.sessionId} to process file upload and face encoding generation: ${timeElapsed}`);
			//* Add to session summary queue
			await this.SessionSummaryQueue.add(this.sessionSummaryJob, {
				sessionId: data.sessionId,
				imagesMetada: uploadResult
			});
		} catch (err) {
			this.logger.error(`Error processing image events for job ${id}:`, err.stack);
			throw err; // Ensure the error is propagated
		}
	}

	private async encodeFaces(formData: FormData): Promise<any> {
		this.logger.log(`Getting face encodings for image`);
		const response = await axios.post(this.faceEncodingServiceUrl, formData, {
			headers: {
				...formData.getHeaders(),
			}
		});
		return response.data;
	}
}
