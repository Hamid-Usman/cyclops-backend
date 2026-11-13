import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clients belong to the owner who added them. The same person can be a
 * client of several owners, once per owner.
 *
 * Existing clients are given the owner of their projects or proposals. The
 * migration stops if a client has none (nobody to give it to) or is shared
 * by several owners (it would need splitting into one client per owner).
 */
export class AddClientOwners1710000000008 implements MigrationInterface {
  name = 'AddClientOwners1710000000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Check before changing anything: MySQL can't roll back ALTER TABLE, so a
    // failure halfway would leave the table half migrated.
    const shared: { id: string }[] = await queryRunner.query(`
      SELECT client_id AS id FROM (
        SELECT client_id, owner_id FROM projects
        UNION SELECT client_id, owner_id FROM proposals WHERE client_id IS NOT NULL
        UNION SELECT client_id, owner_id FROM invoices
      ) used
      GROUP BY client_id HAVING COUNT(DISTINCT owner_id) > 1
    `);
    if (shared.length > 0) {
      throw new Error(
        `Clients used by more than one owner: ${shared.map((row) => row.id).join(', ')}. Split them into one client per owner first.`,
      );
    }

    const orphans: { id: string }[] = await queryRunner.query(`
      SELECT id FROM clients c
      WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.client_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.client_id = c.id)
    `);
    if (orphans.length > 0) {
      throw new Error(
        `Clients with no project or proposal, so no known owner: ${orphans.map((row) => row.id).join(', ')}. Delete them or give them a project first.`,
      );
    }

    await queryRunner.query(
      'ALTER TABLE `clients` ADD `owner_id` char(36) NULL AFTER `id`',
    );
    await queryRunner.query(`
      UPDATE clients c
      JOIN (
        SELECT client_id, MIN(owner_id) AS owner_id FROM (
          SELECT client_id, owner_id FROM projects
          UNION SELECT client_id, owner_id FROM proposals WHERE client_id IS NOT NULL
        ) used
        GROUP BY client_id
      ) owners ON owners.client_id = c.id
      SET c.owner_id = owners.owner_id
    `);

    await queryRunner.query(
      'ALTER TABLE `clients` MODIFY `owner_id` char(36) NOT NULL',
    );
    // The user_id foreign key needs an index of its own once the unique
    // index on user_id is gone. The portal also looks clients up by user.
    await queryRunner.query(
      'CREATE INDEX `IDX_clients_user_id` ON `clients` (`user_id`)',
    );
    await queryRunner.query('DROP INDEX `UQ_clients_user_id` ON `clients`');
    await queryRunner.query(
      'ALTER TABLE `clients` ADD CONSTRAINT `UQ_clients_owner_id_user_id` UNIQUE (`owner_id`, `user_id`)',
    );
    await queryRunner.query(`
      ALTER TABLE \`clients\` ADD CONSTRAINT \`FK_clients_owner_id\`
        FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `clients` DROP FOREIGN KEY `FK_clients_owner_id`',
    );
    await queryRunner.query(
      'DROP INDEX `UQ_clients_owner_id_user_id` ON `clients`',
    );
    // Fails if a person is now a client of several owners.
    await queryRunner.query(
      'ALTER TABLE `clients` ADD CONSTRAINT `UQ_clients_user_id` UNIQUE (`user_id`)',
    );
    await queryRunner.query('DROP INDEX `IDX_clients_user_id` ON `clients`');
    await queryRunner.query('ALTER TABLE `clients` DROP COLUMN `owner_id`');
  }
}
