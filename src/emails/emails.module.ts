import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailEntity } from './entities/email.entity.js';
import { EmailsRepository } from './emails.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([EmailEntity])],
  providers: [EmailsRepository],
  exports: [EmailsRepository],
})
export class EmailsModule {}
