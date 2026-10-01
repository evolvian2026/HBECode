import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { DispatchService } from './executor/dispatch.service.js';
import { ExecutorController } from './executor/executor.controller.js';
import { HealthController } from './health/health.controller.js';
import { InfraModule } from './infra/infra.module.js';
import { OrgModule } from './org/org.module.js';
import { PracticeController, QuestionsController } from './questions/questions.controller.js';
import { QuestionsService } from './questions/questions.service.js';
import { SubmissionsController } from './submissions/submissions.controller.js';
import { SubmissionsService } from './submissions/submissions.service.js';

@Module({
  imports: [InfraModule, AuthModule, OrgModule],
  controllers: [HealthController, QuestionsController, PracticeController, SubmissionsController, ExecutorController],
  providers: [QuestionsService, SubmissionsService, DispatchService],
  exports: [QuestionsService, DispatchService],
})
export class AppModule {}
