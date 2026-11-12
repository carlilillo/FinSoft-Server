import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintToNumber, CLERK_USER_ID_COLUMN, ULID_COLUMN } from '../../database/column-types.js';
import type { ImportFileStatus } from '../domain/import-file.js';

/** An invoice file (PDF or image) the user imported by hand. Its id is also the LangGraph thread_id of its extraction. */
@Entity('import_files')
@Index(['runId'])
export class ImportFileEntity {
  @PrimaryColumn(ULID_COLUMN)
  id: string;

  @Column({ ...CLERK_USER_ID_COLUMN, name: 'user_id' })
  userId: string;

  @Column({ ...ULID_COLUMN, name: 'run_id' })
  runId: string;

  /** Original name, shown to the user. */
  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  /** Path of the original file in the agent workspace. */
  @Column({ name: 'workspace_path', type: 'varchar', length: 255 })
  workspacePath: string;

  /** Real format, read from the file's content: application/pdf or an image type. */
  @Column({ name: 'mime_type', type: 'varchar', length: 127 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'bigint', transformer: bigintToNumber })
  sizeBytes: number;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: ImportFileStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
