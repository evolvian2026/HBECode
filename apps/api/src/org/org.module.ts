import { Module } from '@nestjs/common';
import { Mailer } from '../common/mailer.js';
import { BatchesController, TenantsController, UsersController } from './org.controller.js';
import { OrgService } from './org.service.js';

@Module({ controllers: [TenantsController, UsersController, BatchesController], providers: [OrgService, Mailer], exports: [OrgService] })
export class OrgModule {}
