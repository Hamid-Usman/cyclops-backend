import { MigrationInterface, QueryRunner } from 'typeorm';

// A client can report that they paid an invoice. The owner still confirms it
// by marking the invoice paid.
export class AddInvoicePaymentReports1710000000006 implements MigrationInterface {
  name = 'AddInvoicePaymentReports1710000000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
        ADD \`payment_reported_at\` datetime NULL,
        ADD \`payment_reference\` varchar(200) NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
        DROP COLUMN \`payment_reference\`,
        DROP COLUMN \`payment_reported_at\`
    `);
  }
}
