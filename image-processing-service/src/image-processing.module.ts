import { Module } from '@nestjs/common';
import { ImageProcessingService } from './services/image-processing.service';
import { S3Service } from './services/s3.service';
import { ConfigModule } from '@nestjs/config';
import { SessionSummaryQueueProvider, ImageMetadataQueueProvider } from './providers/queue-providers';

@Module({
  	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
  	],
  	controllers: [],
  	providers: [ImageProcessingService, ImageMetadataQueueProvider, SessionSummaryQueueProvider, S3Service],
})
export class AppModule {}
