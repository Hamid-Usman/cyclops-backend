import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectsAndProposals1710000000002 implements MigrationInterface {
  name = 'CreateProjectsAndProposals1710000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`projects\` (
        \`id\` char(36) NOT NULL,
        \`owner_id\` char(36) NOT NULL,
        \`client_id\` char(36) NOT NULL,
        \`name\` varchar(200) NOT NULL,
        \`description\` text NULL,
        \`status\` enum('inactive','active','completed','cancelled') NOT NULL DEFAULT 'inactive',
        \`start_date\` date NULL,
        \`due_date\` date NULL,
        \`activated_at\` datetime NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`PK_projects_id\` PRIMARY KEY (\`id\`),
        INDEX \`IDX_projects_owner_id_status\` (\`owner_id\`, \`status\`),
        INDEX \`IDX_projects_client_id\` (\`client_id\`),
        CONSTRAINT \`FK_projects_owner_id\` FOREIGN KEY (\`owner_id\`)
          REFERENCES \`users\` (\`id\`),
        CONSTRAINT \`FK_projects_client_id\` FOREIGN KEY (\`client_id\`)
          REFERENCES \`clients\` (\`id\`)
      ) ENGINE=InnoDB
    `);

    // accepted_project_id must equal project_id while status = 'accepted' and
    // be NULL otherwise (the CHECK). Its unique index means a project can
    // never have two accepted proposals. This is a plain column, not a
    // generated one, because MariaDB won't generate it from status and
    // project_id. `<=>` is a null-safe equals, so NULL can't slip past the CHECK.
    await queryRunner.query(`
      CREATE TABLE \`proposals\` (
        \`id\` char(36) NOT NULL,
        \`owner_id\` char(36) NOT NULL,
        \`client_id\` char(36) NOT NULL,
        \`project_id\` char(36) NOT NULL,
        \`title\` varchar(200) NOT NULL,
        \`status\` enum('draft','sent','viewed','accepted','declined','expired','withdrawn','superseded') NOT NULL DEFAULT 'draft',
        \`problem_statement\` text NULL,
        \`deliverables\` text NULL,
        \`estimated_start_date\` date NULL,
        \`estimated_duration\` smallint unsigned NULL,
        \`duration_unit\` enum('days','weeks','months') NULL,
        \`price\` decimal(12,2) unsigned NULL,
        \`currency\` char(3) NOT NULL DEFAULT 'USD',
        \`discount\` decimal(12,2) unsigned NOT NULL DEFAULT 0,
        \`tax_rate\` decimal(5,2) unsigned NOT NULL DEFAULT 0,
        \`deposit_percent\` tinyint unsigned NOT NULL DEFAULT 0,
        \`subtotal\` decimal(12,2) unsigned NULL,
        \`tax_amount\` decimal(12,2) unsigned NULL,
        \`total\` decimal(12,2) unsigned NULL,
        \`deposit\` decimal(12,2) unsigned NULL,
        \`terms\` text NULL,
        \`terms_hash\` char(64) NULL,
        \`valid_until\` datetime NULL,
        \`sent_at\` datetime NULL,
        \`viewed_at\` datetime NULL,
        \`responded_at\` datetime NULL,
        \`accepted_by_name\` varchar(120) NULL,
        \`accepted_ip\` varchar(45) NULL,
        \`accepted_user_agent\` varchar(255) NULL,
        \`terms_accepted_at\` datetime NULL,
        \`decline_reason\` text NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`accepted_project_id\` char(36) NULL,
        CONSTRAINT \`PK_proposals_id\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`UQ_proposals_accepted_project_id\` UNIQUE (\`accepted_project_id\`),
        CONSTRAINT \`CHK_proposals_accepted_project_id\` CHECK (
          (\`status\` = 'accepted' AND \`accepted_project_id\` <=> \`project_id\`)
          OR (\`status\` <> 'accepted' AND \`accepted_project_id\` IS NULL)
        ),
        CONSTRAINT \`CHK_proposals_deposit_percent\` CHECK (\`deposit_percent\` <= 100),
        CONSTRAINT \`CHK_proposals_tax_rate\` CHECK (\`tax_rate\` <= 100),
        INDEX \`IDX_proposals_project_id_status\` (\`project_id\`, \`status\`),
        INDEX \`IDX_proposals_client_id\` (\`client_id\`),
        INDEX \`IDX_proposals_owner_id\` (\`owner_id\`),
        CONSTRAINT \`FK_proposals_owner_id\` FOREIGN KEY (\`owner_id\`)
          REFERENCES \`users\` (\`id\`),
        CONSTRAINT \`FK_proposals_client_id\` FOREIGN KEY (\`client_id\`)
          REFERENCES \`clients\` (\`id\`),
        CONSTRAINT \`FK_proposals_project_id\` FOREIGN KEY (\`project_id\`)
          REFERENCES \`projects\` (\`id\`)
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `proposals`');
    await queryRunner.query('DROP TABLE `projects`');
  }
}
