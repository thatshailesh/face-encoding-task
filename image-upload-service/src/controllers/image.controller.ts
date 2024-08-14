import { Controller, Post, UseInterceptors, UploadedFiles, Param, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ImageService } from '../services/image.service';
import { imageFileFilter } from '../file-upload.util';
import { ConfigService } from '@nestjs/config';

@Controller('images')
export class ImageController {
    constructor(private readonly imageService: ImageService, private readonly configService: ConfigService) {}

    @Post('upload/:sessionId')
    @UseInterceptors(FilesInterceptor('images', 5, {
        fileFilter: imageFileFilter
    }))
    async uploadImages(@UploadedFiles() files: Array<Express.Multer.File>, @Param('sessionId') sessionId: string) {
        const imageUploadLimit = Number(this.configService.get('IMAGE_UPLOAD_LIMIT'))
        const totalImagesPerSessionId = await this.imageService.totalImagesPerSession(sessionId)
        if (totalImagesPerSessionId + files.length > imageUploadLimit) {
            throw new BadRequestException('Maximum 5 images allowed per session')
        }
        return this.imageService.uploadAndQueueImageMetada(files, sessionId)
    }
}