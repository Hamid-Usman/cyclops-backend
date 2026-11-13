import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indexes that match how lists and the dashboard filter and sort:
 * - invoices and projects by owner and status, then due date (the
 *   dashboard's "needs attention" lists);
 * - proposals by owner, newest first (the proposal list).
 *
 * Each new index starts with the columns of the one it replaces, so it also
 * serves that index's queries and the owner_id foreign key.
 */
export class AddListIndexes1710000000009 implements MigrationInterface {
  name = 'AddListIndexes1710000000009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX `IDX_invoices_owner_id_status_due_date` ON `invoices` (`owner_id`, `status`, `due_date`)',
    );
    await queryRunner.query(
      'DROP INDEX `IDX_invoices_owner_id_status` ON `invoices`',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_projects_owner_id_status_due_date` ON `projects` (`owner_id`, `status`, `due_date`)',
    );
    await queryRunner.query(
      'DROP INDEX `IDX_projects_owner_id_status` ON `projects`',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_proposals_owner_id_created_at` ON `proposals` (`owner_id`, `created_at`)',
    );
    await queryRunner.query(
      'DROP INDEX `IDX_proposals_owner_id` ON `proposals`',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX `IDX_proposals_owner_id` ON `proposals` (`owner_id`)',
    );
    await queryRunner.query(
      'DROP INDEX `IDX_proposals_owner_id_created_at` ON `proposals`',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_projects_owner_id_status` ON `projects` (`owner_id`, `status`)',
    );
    await queryRunner.query(
      'DROP INDEX `IDX_projects_owner_id_status_due_date` ON `projects`',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_invoices_owner_id_status` ON `invoices` (`owner_id`, `status`)',
    );
    await queryRunner.query(
      'DROP INDEX `IDX_invoices_owner_id_status_due_date` ON `invoices`',
    );
  }
}
