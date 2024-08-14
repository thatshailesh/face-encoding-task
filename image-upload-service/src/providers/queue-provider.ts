import { Queue } from 'bullmq';
import { Provider } from '@nestjs/common';

export const ImageMetadataQueueProvider: Provider = {
    provide: 'ImageMetadataQueue',
    useFactory: () => {
        return new Queue(process.env.IMAGE_METADATA_QUEUE, {
            connection: {
                host: process.env.REDIS_HOST,
                port: Number(process.env.REDIS_PORT),
            },
        });
    },
};