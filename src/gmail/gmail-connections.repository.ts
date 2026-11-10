import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GmailConnectionEntity } from './entities/gmail-connection.entity.js';

@Injectable()
export class GmailConnectionsRepository {
  constructor(@InjectRepository(GmailConnectionEntity) private readonly repo: Repository<GmailConnectionEntity>) {}

  findByUser(userId: string): Promise<GmailConnectionEntity | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async upsert(connection: GmailConnectionEntity): Promise<void> {
    await this.repo.upsert(connection, ['userId']);
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.repo.delete({ userId });
  }
}
