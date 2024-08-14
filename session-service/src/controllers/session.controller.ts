import { Controller, Post, Get, Param } from '@nestjs/common';
import { SessionService } from '../services/session.service';

@Controller('sessions')
export class SessionController {
    constructor(private readonly sessionService: SessionService) {}

    @Post()
    async createSession() {
        const session = await this.sessionService.createSession();
        return { sessionId: session.sessionId };
    }


    @Get(':id/summary')
    async getSessionSummary(
        @Param('id') sessionId: string
    ) {
        return this.sessionService.getSessionSummary(sessionId)
    }
}
