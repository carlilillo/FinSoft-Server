import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GmailConnectionEntity } from './entities/gmail-connection.entity.js';
import { GmailConnectionsRepository } from './gmail-connections.repository.js';
import { GmailController } from './gmail.controller.js';
import { GmailService } from './gmail.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([GmailConnectionEntity])],
  controllers: [GmailController],
  providers: [GmailService, GmailConnectionsRepository],
  exports: [GmailService],
})
export class GmailModule {}
