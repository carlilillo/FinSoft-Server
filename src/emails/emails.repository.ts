import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { EmailLanguage, TriageVerdict } from './domain/triage.js';
import { EmailEntity } from './entities/email.entity.js';

@Injectable()
export class EmailsRepository {
  constructor(@InjectRepository(EmailEntity) private readonly repo: Repository<EmailEntity>) {}

  async insertMany(emails: EmailEntity[]): Promise<void> {
    if (emails.length === 0) return;
    await this.repo.createQueryBuilder().insert().values(emails).orIgnore().execute();
  }

  findForRun(userId: string, runId: string): Promise<EmailEntity[]> {
    return this.repo.find({ where: { userId, runId }, order: { receivedAt: 'DESC' } });
  }

  findOneForRun(userId: string, runId: string, emailId: string): Promise<EmailEntity | null> {
    return this.repo.findOne({ where: { id: emailId, userId, runId } });
  }

  async updateTriage(
    emailId: string,
    patch: { triage: TriageVerdict; triageReason?: string | null; language?: EmailLanguage | null },
  ): Promise<void> {
    await this.repo.update({ id: emailId }, patch);
  }

  async markMany(ids: string[], triage: TriageVerdict): Promise<void> {
    if (ids.length === 0) return;
    await this.repo.update({ id: In(ids) }, { triage });
  }

  countReviewed(runId: string): Promise<number> {
    return this.repo.count({ where: { runId, triage: In(['likely_invoice', 'not_invoice', 'extracted', 'failed']) } });
  }
}
