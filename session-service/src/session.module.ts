import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SessionController } from './controllers/session.controller';
import { SessionService } from './services/session.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Session, SessionSchema } from './schemas/session.schema';
import { SessionSummaryQueueProvider } from './providers/queue-providers';
import { S3Service } from './services/s3.service';

@Module({
    imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		MongooseModule.forFeature([{
        	name: Session.name, schema: SessionSchema
		}]),
		MongooseModule.forRootAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => {
			  const mongo_uri = configService.get<string>('MONGO_URI');
			  return { uri: mongo_uri };
			},
			inject: [ConfigService],
		}),
    ],
    controllers: [SessionController],
    providers: [SessionService, SessionSummaryQueueProvider, S3Service],
})
export class SessionModule {}
