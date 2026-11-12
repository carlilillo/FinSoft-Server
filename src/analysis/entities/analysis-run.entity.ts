import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { CLERK_USER_ID_COLUMN, ULID_COLUMN } from '../../database/column-types.js';
import type { RunSource, RunStatus } from '../domain/analysis-run.js';

/** One extraction session. For Gmail sessions its id is also the LangGraph thread_id. */
@Entity('analysis_runs')
@Index(['userId', 'createdAt'])
export class AnalysisRunEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...CLERK_USER_ID_COLUMN, name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar', length: 16, default: 'gmail' })
  source: RunSource;

  @Column({ type: 'varchar', length: 24 })
  status: RunStatus;

  @Column({
    name: 'stage_detail',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  stageDetail: string | null;

  @Column({ name: 'emails_total', type: 'int', default: 0 })
  emailsTotal: number;

  @Column({ name: 'documents_total', type: 'int', default: 0 })
  documentsTotal: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'invocation_count', type: 'int', default: 0 })
  invocationCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}
