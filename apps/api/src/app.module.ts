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
import { RealtimeGateway } from './realtime/realtime.gateway.js';
import { RealtimeService } from './realtime/realtime.service.js';
import { AttemptsService } from './tests/attempts.service.js';
import { AttemptsController, MyTestsController, TestsController } from './tests/tests.controller.js';
import { TestsService } from './tests/tests.service.js';
import { ExportsController, UploadsController } from './uploads/uploads.controller.js';
import { UploadsService } from './uploads/uploads.service.js';
import { PlagiarismService } from './plagiarism/plagiarism.service.js';
import { PlagiarismController, ReportsController } from './reports/reports.controller.js';
import { ReportsService } from './reports/reports.service.js';

@Module({
  imports: [InfraModule, AuthModule, OrgModule],
  controllers: [HealthController, QuestionsController, PracticeController, SubmissionsController, ExecutorController, TestsController, MyTestsController, AttemptsController, UploadsController, ExportsController, ReportsController, PlagiarismController],
  providers: [QuestionsService, SubmissionsService, DispatchService, RealtimeService, TestsService, AttemptsService, RealtimeGateway, UploadsService, ReportsService, PlagiarismService],
  exports: [QuestionsService, DispatchService, AttemptsService],
})
export class AppModule {}
