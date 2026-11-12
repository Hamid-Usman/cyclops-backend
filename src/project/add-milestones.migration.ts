import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Payment schedules and generated projects:
 * - A proposal can be sent to a client without a project; accepting it
 *   creates the project (so project_id becomes nullable until then).
 * - proposal_milestones: the payment schedule the client agrees to.
 * - project_milestones: copied from the accepted proposal, each one billable
 *   once (invoice_id), plus the deposit or balance rows.
 */
export class AddMilestones1710000000007 implements MigrationInterface {
  name = 'AddMilestones1710000000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `proposals` MODIFY `project_id` char(36) NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `projects` ADD `deliverables` text NULL',
    );

    await queryRunner.query(`
      CREATE TABLE \`proposal_milestones\` (
        \`id\` char(36) NOT NULL,
        \`proposal_id\` char(36) NOT NULL,
        \`position\` smallint unsigned NOT NULL,
        \`title\` varchar(200) NOT NULL,
        \`deliverables\` text NULL,
        \`percent\` decimal(5,2) unsigned NOT NULL,
        \`due_date\` date NULL,
        CONSTRAINT \`PK_proposal_milestones_id\` PRIMARY KEY (\`id\`),
        INDEX \`IDX_proposal_milestones_proposal_id_position\` (\`proposal_id\`, \`position\`),
        CONSTRAINT \`FK_proposal_milestones_proposal_id\` FOREIGN KEY (\`proposal_id\`)
          REFERENCES \`proposals\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`CHK_proposal_milestones_percent\` CHECK (\`percent\` > 0 AND \`percent\` <= 100)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`project_milestones\` (
        \`id\` char(36) NOT NULL,
        \`project_id\` char(36) NOT NULL,
        \`position\` smallint unsigned NOT NULL,
        \`kind\` enum('deposit','milestone','balance') NOT NULL,
        \`title\` varchar(200) NOT NULL,
        \`deliverables\` text NULL,
        \`percent\` decimal(5,2) unsigned NOT NULL,
        \`amount\` decimal(12,2) unsigned NOT NULL,
        \`currency\` char(3) NOT NULL,
        \`due_date\` date NULL,
        \`completed_at\` datetime NULL,
        \`invoice_id\` char(36) NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT \`PK_project_milestones_id\` PRIMARY KEY (\`id\`),
        INDEX \`IDX_project_milestones_project_id_position\` (\`project_id\`, \`position\`),
        CONSTRAINT \`FK_project_milestones_project_id\` FOREIGN KEY (\`project_id\`)
          REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_project_milestones_invoice_id\` FOREIGN KEY (\`invoice_id\`)
          REFERENCES \`invoices\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `project_milestones`');
    await queryRunner.query('DROP TABLE `proposal_milestones`');
    await queryRunner.query(
      'ALTER TABLE `projects` DROP COLUMN `deliverables`',
    );
    // Fails if a proposal still has no project; assign or delete those first.
    await queryRunner.query(
      'ALTER TABLE `proposals` MODIFY `project_id` char(36) NOT NULL',
    );
  }
}
