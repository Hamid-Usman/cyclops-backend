import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleSignIn1710000000005 implements MigrationInterface {
  name = 'AddGoogleSignIn1710000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Accounts created through Google have no password.
    await queryRunner.query(`
      ALTER TABLE \`users\`
        MODIFY \`password_hash\` varchar(200) NULL,
        ADD \`google_subject\` varchar(255) NULL,
        ADD CONSTRAINT \`UQ_users_google_subject\` UNIQUE (\`google_subject\`)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`users\`
        DROP INDEX \`UQ_users_google_subject\`,
        DROP COLUMN \`google_subject\`,
        MODIFY \`password_hash\` varchar(200) NOT NULL
    `);
  }
}
