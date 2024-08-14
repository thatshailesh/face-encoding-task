import { Module } from '@nestjs/common';
import { ImageController } from './controllers/image.controller';
import { S3Service } from './services/s3.service';
import { ImageService } from './services/image.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ImageMetadata, ImageMetadataSchema } from './schemas/image-metadata.schema';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ImageMetadataQueueProvider } from './providers/queue-provider';
import { Session, SessionSchema } from './schemas/session.schema';

@Module({
  	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		MongooseModule.forFeature([
			{
        		name: ImageMetadata.name, schema: ImageMetadataSchema,
			},
			{
				name: Session.name, schema: SessionSchema
			}
		]),
		MongooseModule.forRootAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => {
			  const mongo_uri = configService.get<string>('MONGO_URI');
			  return { uri: mongo_uri };
			},
			inject: [ConfigService],
		}),
  	],
  	controllers: [ImageController],
  	providers: [S3Service, ImageService, ImageMetadataQueueProvider],
})
export class ImageModule {}
