import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from '../agent/agent.module.js';
import { AnalysisModule } from '../analysis/analysis.module.js';
import { ImportsModule } from '../imports/imports.module.js';
import { AccountService } from './account.service.js';
import { clerkClientProvider } from './clerk.provider.js';
import { UserEntity } from './entities/user.entity.js';
import { EnsureUserInterceptor } from './ensure-user.interceptor.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), AnalysisModule, AgentModule, ImportsModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    AccountService,
    clerkClientProvider,
    { provide: APP_INTERCEPTOR, useClass: EnsureUserInterceptor },
  ],
  exports: [UsersService],
})
export class UsersModule {}
