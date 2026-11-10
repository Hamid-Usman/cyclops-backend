import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvoices1710000000003 implements MigrationInterface {
  name = 'CreateInvoices1710000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    // A unique index allows many NULLs, so drafts (no number yet) don't clash.
    await queryRunner.query(`
      CREATE TABLE \`invoices\` (
        \`id\` char(36) NOT NULL,
        \`owner_id\` char(36) NOT NULL,
        \`client_id\` char(36) NOT NULL,
        \`project_id\` char(36) NOT NULL,
        \`number\` int unsigned NULL,
        \`status\` enum('draft','sent','paid','void') NOT NULL DEFAULT 'draft',
        \`title\` varchar(200) NOT NULL,
        \`description\` text NULL,
        \`notes\` text NULL,
        \`currency\` char(3) NOT NULL DEFAULT 'USD',
        \`amount\` decimal(12,2) unsigned NOT NULL,
        \`tax_rate\` decimal(5,2) unsigned NOT NULL DEFAULT 0,
        \`tax_amount\` decimal(12,2) unsigned NOT NULL,
        \`total\` decimal(12,2) unsigned NOT NULL,
        \`issue_date\` date NULL,
        \`due_date\` date NULL,
        \`sent_at\` datetime NULL,
        \`paid_at\` datetime NULL,
        \`voided_at\` datetime NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`PK_invoices_id\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`UQ_invoices_owner_id_number\` UNIQUE (\`owner_id\`, \`number\`),
        CONSTRAINT \`CHK_invoices_tax_rate\` CHECK (\`tax_rate\` <= 100),
        CONSTRAINT \`CHK_invoices_number_when_sent\` CHECK (
          (\`status\` = 'draft' AND \`number\` IS NULL)
          OR (\`status\` <> 'draft' AND \`number\` IS NOT NULL)
        ),
        INDEX \`IDX_invoices_owner_id_status\` (\`owner_id\`, \`status\`),
        INDEX \`IDX_invoices_project_id\` (\`project_id\`),
        INDEX \`IDX_invoices_client_id\` (\`client_id\`),
        CONSTRAINT \`FK_invoices_owner_id\` FOREIGN KEY (\`owner_id\`)
          REFERENCES \`users\` (\`id\`),
        CONSTRAINT \`FK_invoices_client_id\` FOREIGN KEY (\`client_id\`)
          REFERENCES \`clients\` (\`id\`),
        CONSTRAINT \`FK_invoices_project_id\` FOREIGN KEY (\`project_id\`)
          REFERENCES \`projects\` (\`id\`)
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `invoices`');
  }
}
