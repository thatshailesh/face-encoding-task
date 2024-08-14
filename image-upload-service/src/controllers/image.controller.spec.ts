import { Test, TestingModule } from '@nestjs/testing';
import { ImageController } from './image.controller';
import { ImageService } from '../services/image.service';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { imageFileFilter } from '../file-upload.util';

describe.only('ImageController', () => {
	let imageController: ImageController;
	let imageService: ImageService;
    let mockConfigService: jest.Mocked<ConfigService>;
	const mockImageService = {
		totalImagesPerSession: jest.fn(),
		uploadAndQueueImageMetada: jest.fn(),
	};

	beforeEach(async () => {
        mockConfigService = {
			get: jest.fn(),
		} as any;
		const module: TestingModule = await Test.createTestingModule({
			controllers: [ImageController],
			providers: [
				{
					provide: ImageService,
					useValue: mockImageService,
				},
                { provide: ConfigService, useValue: mockConfigService },
			],
		}).compile();

		imageController = module.get<ImageController>(ImageController);
		imageService = module.get<ImageService>(ImageService);
	});

	it('should be defined', () => {
		expect(imageController).toBeDefined();
	});

	describe('uploadImages', () => {
		it('should upload images successfully', async () => {
			const files = [{ originalname: 'test.jpg', mimetype: 'image/jpeg', size: 12345 }] as Array<Express.Multer.File>;
			const sessionId = 'session123';
			const mockMetadata = [{ filename: 'test.jpg', imageId: 'uuid-123', imageUrl: 'http://example.com/test.jpg' }];

			jest.spyOn(mockImageService, 'totalImagesPerSession').mockResolvedValue(0);
			jest.spyOn(mockImageService, 'uploadAndQueueImageMetada').mockResolvedValue(mockMetadata);

			const result = await imageController.uploadImages(files, sessionId);
			expect(result).toEqual(mockMetadata);
			expect(mockImageService.totalImagesPerSession).toHaveBeenCalledWith(sessionId);
			expect(mockImageService.uploadAndQueueImageMetada).toHaveBeenCalledWith(files, sessionId);
		});

		it('should throw BadRequestException if image limit exceeded', async () => {
			const files = [
                { originalname: 'test.jpg', mimetype: 'image/jpeg', size: 12345 },
                { originalname: 'test1.jpg', mimetype: 'image/jpeg', size: 12345 }
            ] as Array<Express.Multer.File>;
			const sessionId = 'session123';
            mockConfigService.get.mockReturnValue('1');
			jest.spyOn(mockImageService, 'totalImagesPerSession').mockResolvedValue(0);

			await expect(imageController.uploadImages(files, sessionId)).rejects.toThrow(BadRequestException);
		});

        it('should allow only image files (jpg, jpeg, png, gif)', async () => {
			const req = {};
			const file = { originalname: 'test.jpg', mimetype: 'image/jpeg', size: 12345 };
			const callback = jest.fn();
	
			imageFileFilter(req, file, callback);
	
			expect(callback).toHaveBeenCalledWith(null, true);
		});

		it('should reject non-image files', async () => {
			const req = {};
			const file = { originalname: 'test.txt', mimetype: 'text/plain', size: 12345 };
			const callback = jest.fn();
	
			imageFileFilter(req, file, callback);
	
			expect(callback).toHaveBeenCalledWith(new BadRequestException('Only image files are allowed!'), false);
		});
	});
});