import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvoiceLineItems1710000000004 implements MigrationInterface {
  name = 'CreateInvoiceLineItems1710000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`invoice_line_items\` (
        \`id\` char(36) NOT NULL,
        \`invoice_id\` char(36) NOT NULL,
        \`position\` int unsigned NOT NULL,
        \`description\` varchar(500) NOT NULL,
        \`quantity\` decimal(10,2) unsigned NOT NULL,
        \`unit_price\` decimal(12,2) unsigned NOT NULL,
        \`amount\` decimal(12,2) unsigned NOT NULL,
        CONSTRAINT \`PK_invoice_line_items_id\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`UQ_invoice_line_items_invoice_id_position\`
          UNIQUE (\`invoice_id\`, \`position\`),
        CONSTRAINT \`CHK_invoice_line_items_quantity\` CHECK (\`quantity\` > 0),
        CONSTRAINT \`FK_invoice_line_items_invoice_id\` FOREIGN KEY (\`invoice_id\`)
          REFERENCES \`invoices\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // Each existing invoice becomes one line for its full amount.
    await queryRunner.query(`
      INSERT INTO \`invoice_line_items\`
        (\`id\`, \`invoice_id\`, \`position\`, \`description\`, \`quantity\`, \`unit_price\`, \`amount\`)
      SELECT UUID(), \`id\`, 0, LEFT(\`title\`, 500), 1, \`amount\`, \`amount\`
      FROM \`invoices\`
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `invoice_line_items`');
  }
}
