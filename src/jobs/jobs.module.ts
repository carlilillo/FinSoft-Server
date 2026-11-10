import { Global, Module } from '@nestjs/common';
import { JobQueueService } from './job-queue.service.js';

@Global()
@Module({
  providers: [JobQueueService],
  exports: [JobQueueService],
})
export class JobsModule {}
