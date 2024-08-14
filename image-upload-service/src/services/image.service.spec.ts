import { Test, TestingModule } from '@nestjs/testing';
import { ImageService } from './image.service';
import { S3Service } from './s3.service';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { ImageMetadata, ImageMetadataDocument } from '../schemas/image-metadata.schema';
import { Session } from '../schemas/session.schema';
import { Queue } from 'bullmq';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Model } from 'mongoose';

jest.mock('uuid', () => ({ v1: () => 'mocked-uuid' }));

describe('ImageService', () => {
	let service: ImageService;
	let mockS3Service: jest.Mocked<S3Service>;
	let mockConfigService: jest.Mocked<ConfigService>;
	let mockImageMetadataModel: Model<ImageMetadataDocument>;
	let mockSessionModel: jest.Mocked<Model<Session>>;
	let mockImageMetadataQueue: jest.Mocked<Queue>;

	beforeEach(async () => {
		mockS3Service = {
			uploadFile: jest.fn(),
		} as any;

		mockConfigService = {
			get: jest.fn(),
		} as any;

		mockSessionModel = {
			findOne: jest.fn(),
		} as any;

		mockImageMetadataQueue = {
			add: jest.fn(),
		} as any;

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ImageService,
				{ provide: S3Service, useValue: mockS3Service },
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: getModelToken(ImageMetadata.name), useValue: {create: jest.fn(), countDocuments: jest.fn()} },
				{ provide: getModelToken(Session.name), useValue: mockSessionModel },
				{ provide: 'ImageMetadataQueue', useValue: mockImageMetadataQueue },
			],
		}).compile();
        mockImageMetadataModel = module.get<Model<ImageMetadataDocument>>(getModelToken(ImageMetadata.name));
		service = module.get<ImageService>(ImageService);
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('uploadImageToS3AndSaveMetadata', () => {
		it('should upload image to S3 and save metadata', async () => {
			const mockFile = {
				originalname: 'test.jpg',
				mimetype: 'image/jpeg',
				size: 1024,
				buffer: Buffer.from('test'),
			} as Express.Multer.File;
			const sessionId = 'test-session';
			const mockImageUrl = 'https://test-bucket.s3.amazonaws.com/test-image.jpg';

			mockS3Service.uploadFile.mockResolvedValue(mockImageUrl);
            const imageMetadata = {
                sessionId,
                imageUrl: mockImageUrl,
                filename: 'test.jpg',
                filetype: 'image/jpeg',
				filesize: 1024,
				imageId: 'mocked-uuid',
            };
			const result = await service.uploadImageToS3AndSaveMetadata(mockFile, sessionId);
            const spySave = jest
                        .spyOn(mockImageMetadataModel, 'create')
                        .mockResolvedValue(imageMetadata as any);
			expect(mockS3Service.uploadFile).toHaveBeenCalledWith(mockFile, sessionId, 'mocked-uuid');
            expect(spySave).toHaveBeenCalled();
			expect(result).toEqual({
				filename: 'test.jpg',
				filetype: 'image/jpeg',
				filesize: 1024,
				imageId: 'mocked-uuid',
				imageUrl: mockImageUrl,
			});
		});

		it('should throw InternalServerErrorException on upload failure', async () => {
			const mockFile = {
				originalname: 'test.jpg',
				mimetype: 'image/jpeg',
				size: 1024,
				buffer: Buffer.from('test'),
			} as Express.Multer.File;
			const sessionId = 'test-session';

			mockS3Service.uploadFile.mockRejectedValue(new Error('Upload failed'));

			await expect(service.uploadImageToS3AndSaveMetadata(mockFile, sessionId))
				.rejects.toThrow(InternalServerErrorException);
		});
	});

	describe('uploadAndQueueImageMetada', () => {
		it('should upload multiple files and queue metadata', async () => {
			const mockFiles = [
				{ originalname: 'test1.jpg', mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('test1') },
				{ originalname: 'test2.jpg', mimetype: 'image/jpeg', size: 2048, buffer: Buffer.from('test2') },
			] as Express.Multer.File[];
			const sessionId = 'test-session';

			mockSessionModel.findOne.mockResolvedValue({ sessionId });
			const mockImageUrl = 'https://test-bucket.s3.amazonaws.com/test-image.jpg';

			mockS3Service.uploadFile.mockResolvedValue(mockImageUrl);
            const imageMetadata = {
                sessionId,
                imageUrl: mockImageUrl,
                filename: 'test.jpg',
                filetype: 'image/jpeg',
				filesize: 1024,
				imageId: 'mocked-uuid',
            };
			const spySave = jest
                        .spyOn(mockImageMetadataModel, 'create')
                        .mockResolvedValue(imageMetadata as any);

			mockConfigService.get.mockReturnValue('IMAGE_METADATA_JOB');

			const result = await service.uploadAndQueueImageMetada(mockFiles, sessionId);

			expect(mockSessionModel.findOne).toHaveBeenCalledWith({ sessionId });
			expect(mockS3Service.uploadFile).toHaveBeenCalledTimes(2);
			expect(spySave).toHaveBeenCalledTimes(2);
			expect(mockImageMetadataQueue.add).toHaveBeenCalledWith(
                undefined,
				{ sessionId, metadata: expect.arrayContaining([
					{
						filename: 'test1.jpg',
						filesize: 1024,
						filetype: 'image/jpeg',
						imageId: 'mocked-uuid',
						imageUrl: 'https://test-bucket.s3.amazonaws.com/test-image.jpg',
					},
					{
						filename: 'test2.jpg',
						filesize: 2048,
						filetype: 'image/jpeg',
						imageId: 'mocked-uuid',
						imageUrl: 'https://test-bucket.s3.amazonaws.com/test-image.jpg',
					}
				]), startTime: expect.any(Number) },
				expect.any(Object)
			);
			expect(result).toHaveLength(2);
		});

		it('should throw BadRequestException for invalid session', async () => {
			const mockFiles = [{ originalname: 'test.jpg', mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('test') }] as Express.Multer.File[];
			const sessionId = 'invalid-session';

			mockSessionModel.findOne.mockResolvedValue(null);

			await expect(service.uploadAndQueueImageMetada(mockFiles, sessionId))
				.rejects.toThrow(BadRequestException);
		});

		it('should throw InternalServerErrorException on upload failure', async () => {
			const mockFiles = [{ originalname: 'test.jpg', mimetype: 'image/jpeg', size: 1024, buffer: Buffer.from('test') }] as Express.Multer.File[];
			const sessionId = 'test-session';

			mockSessionModel.findOne.mockResolvedValue({ sessionId });
			mockS3Service.uploadFile.mockRejectedValue(new Error('Upload failed'));

			await expect(service.uploadAndQueueImageMetada(mockFiles, sessionId))
				.rejects.toThrow(InternalServerErrorException);
		});
	});

	describe('totalImagesPerSession', () => {
		it('should return the total number of images for a session', async () => {
			const sessionId = 'test-session';
			const mockCount = 5;

            mockImageMetadataModel.countDocuments = jest.fn().mockResolvedValue(mockCount);
		
            const result = await service.totalImagesPerSession(sessionId);

			expect(mockImageMetadataModel.countDocuments).toHaveBeenCalledWith({ sessionId });
			expect(result).toBe(mockCount);
		});

		it('should throw InternalServerErrorException on count failure', async () => {
			const sessionId = 'test-session';

			mockImageMetadataModel.countDocuments = jest.fn().mockRejectedValue(new Error('Count failed'));

			await expect(service.totalImagesPerSession(sessionId))
				.rejects.toThrow(InternalServerErrorException);
		});
	});
});