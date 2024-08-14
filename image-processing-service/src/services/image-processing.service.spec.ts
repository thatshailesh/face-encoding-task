import { Test, TestingModule } from '@nestjs/testing';
import { ImageProcessingService } from './image-processing.service';
import { ConfigService } from '@nestjs/config';
import { S3Service } from './s3.service';
import { Queue } from 'bullmq';
import axios from 'axios';

jest.mock('axios');
jest.mock('bullmq');

describe('ImageProcessingService', () => {
	let service: ImageProcessingService;
	let mockS3Service: jest.Mocked<S3Service>;
	let mockConfigService: jest.Mocked<ConfigService>;
	let mockImageMetadataQueue: jest.Mocked<Queue>;
	let mockSessionSummaryQueue: jest.Mocked<Queue>;

	beforeAll(async () => {
		mockS3Service = {
			uploadFile: jest.fn(),
			getFile: jest.fn(),
		} as any;

		mockConfigService = {
			get: jest.fn(),
		} as any;

		mockImageMetadataQueue = {
			add: jest.fn(),
			opts: { connection: {} },
		} as any;

		mockSessionSummaryQueue = {
			add: jest.fn(),
		} as any;

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ImageProcessingService,
				{ provide: S3Service, useValue: mockS3Service },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: 'ImageMetadataQueue', useValue: mockImageMetadataQueue },
				{ provide: 'SessionSummaryQueue', useValue: mockSessionSummaryQueue },
			],
		}).compile();

		service = module.get<ImageProcessingService>(ImageProcessingService);
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('processImageEventsAndQueueEncodings', () => {
		it('should process single image event successfully', async () => {
			const mockData = {
				metadata: [{ imageUrl: 'test-url', filename: 'test.jpg', imageId: '123' }],
				sessionId: 'session123',
				startTime: Date.now()
			};
			const mockJobId = 'job123';

			mockConfigService.get.mockReturnValue('test-bucket');
			mockS3Service.uploadFile.mockResolvedValue({ encodingfileKey: 'test-key', filename: 'test.jpg', imageId: '123' });

			(axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('test') });
			(axios.post as jest.Mock).mockResolvedValue({ data: ['encoding'] });

			await service.processImageEventsAndQueueEncodings(mockData, mockJobId);

			expect(mockS3Service.uploadFile).toHaveBeenCalledTimes(1);
			expect(mockSessionSummaryQueue.add).toHaveBeenCalledTimes(1);
			expect(mockSessionSummaryQueue.add).toHaveBeenCalledWith(
				undefined,
				expect.objectContaining({
					sessionId: 'session123',
					imagesMetada: expect.arrayContaining([
						expect.objectContaining({ encodingfileKey: 'test-key' })
					])
				}),
			);
		});

		it('should process multiple image events successfully', async () => {
			const mockData = {
				metadata: [
					{ imageUrl: 'test-url-1', filename: 'test1.jpg', imageId: '123' },
					{ imageUrl: 'test-url-2', filename: 'test2.jpg', imageId: '456' },
				],
				sessionId: 'session123',
				startTime: Date.now()
			};
			const mockJobId = 'job123';

			mockConfigService.get.mockReturnValue('test-bucket');
			mockS3Service.uploadFile.mockResolvedValue({ encodingfileKey: 'test-key', filename: 'test.jpg', imageId: '123' });

			(axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('test') });
			(axios.post as jest.Mock).mockResolvedValue({ data: ['encoding'] });

			await service.processImageEventsAndQueueEncodings(mockData, mockJobId);

			expect(axios.get).toHaveBeenCalledTimes(2);
			expect(axios.post).toHaveBeenCalledTimes(2);
			expect(mockS3Service.uploadFile).toHaveBeenCalledTimes(2);
			expect(mockSessionSummaryQueue.add).toHaveBeenCalledTimes(1);
			expect(mockSessionSummaryQueue.add).toHaveBeenCalledWith(
				undefined,
				expect.objectContaining({
					sessionId: 'session123',
					imagesMetada: expect.arrayContaining([
						expect.objectContaining({ encodingfileKey: 'test-key' }),
						expect.objectContaining({ encodingfileKey: 'test-key' })
					])
				}),
			);
		});

		it('should handle image with no face encodings', async () => {
			const mockData = {
				metadata: [{ imageUrl: 'test-url', filename: 'test.jpg', imageId: '123' }],
				sessionId: 'session123',
				startTime: Date.now()
			};
			const mockJobId = 'job123';

			mockConfigService.get.mockReturnValue('test-bucket');
			(axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('test') });
			(axios.post as jest.Mock).mockResolvedValue({ data: [] }); // No encodings

			await service.processImageEventsAndQueueEncodings(mockData, mockJobId);

			expect(mockS3Service.uploadFile).not.toHaveBeenCalled();
			expect(mockSessionSummaryQueue.add).toHaveBeenCalledWith(
					undefined,
					expect.objectContaining({
					sessionId: 'session123',
					imagesMetada: [expect.objectContaining({ encodingfileKey: '' })]
				}),
			);
		});

		it('should handle errors during image download', async () => {
			const mockData = {
				metadata: [{ imageUrl: 'test-url', filename: 'test.jpg', imageId: '123' }],
				sessionId: 'session123',
				startTime: Date.now()
			};
			const mockJobId = 'job123';

			mockConfigService.get.mockReturnValue('test-bucket');
			(axios.get as jest.Mock).mockRejectedValue(new Error('Download error'));

			await expect(service.processImageEventsAndQueueEncodings(mockData, mockJobId)).rejects.toThrow('Download error');
		});

		it('should handle errors during face encoding', async () => {
			const mockData = {
				metadata: [{ imageUrl: 'test-url', filename: 'test.jpg', imageId: '123' }],
				sessionId: 'session123',
				startTime: Date.now()
			};
			const mockJobId = 'job123';

			mockConfigService.get.mockReturnValue('test-bucket');
			(axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('test') });
			(axios.post as jest.Mock).mockRejectedValue(new Error('Encoding error'));

			await expect(service.processImageEventsAndQueueEncodings(mockData, mockJobId)).rejects.toThrow('Encoding error');
		});

		it('should handle errors during S3 upload', async () => {
			const mockData = {
				metadata: [{ imageUrl: 'test-url', filename: 'test.jpg', imageId: '123' }],
				sessionId: 'session123',
				startTime: Date.now()
			};
			const mockJobId = 'job123';

			mockConfigService.get.mockReturnValue('test-bucket');
			(axios.get as jest.Mock).mockResolvedValue({ data: Buffer.from('test') });
			(axios.post as jest.Mock).mockResolvedValue({ data: ['encoding'] });
			mockS3Service.uploadFile.mockRejectedValue(new Error('S3 upload error'));

			await expect(service.processImageEventsAndQueueEncodings(mockData, mockJobId)).rejects.toThrow('S3 upload error');
		});
	});

	describe('onModuleInit', () => {
		it('should initialize the image queue worker', () => {
			mockConfigService.get.mockReturnValueOnce('IMAGE_METADATA_QUEUE')
			.mockReturnValueOnce('IMAGE_METADATA_JOB')
			.mockReturnValueOnce(5);
			
			const initSpy = jest.spyOn(service as any, 'initializeImageQueueWorker');
			service.onModuleInit();
			expect(initSpy).toHaveBeenCalled();
		});
	});
});