import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { GmailConnectionEntity } from './entities/gmail-connection.entity.js';

@Injectable()
export class GmailConnectionsRepository {
  constructor(@InjectRepository(GmailConnectionEntity) private readonly repo: Repository<GmailConnectionEntity>) {}

  /** The accounts FinSift can read right now, in the order they were connected. */
  findConnected(userId: string): Promise<GmailConnectionEntity[]> {
    return this.repo.find({
      where: { userId, refreshTokenEnc: Not(IsNull()) },
      order: { connectedAt: 'ASC', id: 'ASC' },
    });
  }

  countConnected(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, refreshTokenEnc: Not(IsNull()) } });
  }

  findOwned(userId: string, id: string): Promise<GmailConnectionEntity | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  findByEmail(userId: string, googleEmail: string): Promise<GmailConnectionEntity | null> {
    return this.repo.findOne({ where: { userId, googleEmail } });
  }

  /** Address of every account the user ever linked (disconnected ones included), by connection id. */
  async findAddresses(userId: string): Promise<Map<string, string>> {
    const rows = await this.repo.find({ where: { userId }, select: { id: true, googleEmail: true } });
    return new Map(rows.map((row) => [row.id, row.googleEmail]));
  }

  async save(connection: GmailConnectionEntity): Promise<void> {
    await this.repo.save(connection);
  }

  async clearToken(id: string): Promise<void> {
    await this.repo.update({ id }, { refreshTokenEnc: null });
  }
}
