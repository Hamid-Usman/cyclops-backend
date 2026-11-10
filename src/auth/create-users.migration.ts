import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1710000000000 implements MigrationInterface {
  name = 'CreateUsers1710000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`users\` (
        \`id\` char(36) NOT NULL,
        \`email\` varchar(320) NOT NULL,
        \`display_name\` varchar(80) NOT NULL,
        \`password_hash\` varchar(200) NOT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT \`PK_users_id\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`UQ_users_email\` UNIQUE (\`email\`)
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `users`');
  }
}
