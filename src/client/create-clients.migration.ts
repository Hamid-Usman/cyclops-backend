import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClients1710000000001 implements MigrationInterface {
  name = 'CreateClients1710000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`clients\` (
        \`id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`status\` enum('lead','active','inactive','archived') NOT NULL DEFAULT 'active',
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`PK_clients_id\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`UQ_clients_user_id\` UNIQUE (\`user_id\`),
        CONSTRAINT \`FK_clients_user_id\` FOREIGN KEY (\`user_id\`)
          REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `clients`');
  }
}
