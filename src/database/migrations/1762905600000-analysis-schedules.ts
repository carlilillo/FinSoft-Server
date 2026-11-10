import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Weekly scheduled Gmail analyses: one row per user, mirrored into a pg-boss cron schedule. */
export class AnalysisSchedules1762905600000 implements MigrationInterface {
  name = 'AnalysisSchedules1762905600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE analysis_schedules (
        user_id varchar(32) PRIMARY KEY REFERENCES users(clerk_user_id) ON DELETE CASCADE,
        enabled boolean NOT NULL DEFAULT false,
        weekday varchar(9) NOT NULL,
        hour smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
        time_zone varchar(64) NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE analysis_schedules;`);
  }
}
