import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportFileEntity } from './entities/import-file.entity.js';
import { ImportFilesRepository } from './import-files.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([ImportFileEntity])],
  providers: [ImportFilesRepository],
  exports: [ImportFilesRepository],
})
export class ImportsModule {}
