import { Queue } from 'bullmq';
import { Provider } from '@nestjs/common';

export const SessionSummaryQueueProvider: Provider = {
    provide: 'SessionSummaryQueue',
    useFactory: () => {
        return new Queue(process.env.SESSION_SUMMARY_QUEUE, {
            connection: {
                host: process.env.REDIS_HOST,
                port: Number(process.env.REDIS_PORT),
            },
        });
    },
}