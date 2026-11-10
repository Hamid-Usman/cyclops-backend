import { ApiProperty } from '@nestjs/swagger';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { formatInvoiceNumber, isOverdue, toDateOnly } from './invoice.rules';

export class InvoiceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'INV-0001',
    description: 'Given when the invoice is sent',
  })
  number: string | null;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  clientId: string;

  @ApiProperty({ example: 'Deposit for checkout redesign' })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ enum: InvoiceStatus })
  status: InvoiceStatus;

  @ApiProperty({ description: 'Sent and past its due date' })
  isOverdue: boolean;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 967.5, description: 'Before tax' })
  amount: number;

  @ApiProperty({ example: 7.5 })
  taxRate: number;

  @ApiProperty({ example: 72.56 })
  taxAmount: number;

  @ApiProperty({ example: 1040.06 })
  total: number;

  @ApiProperty({ type: String, nullable: true, example: '2026-12-01' })
  issueDate: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-12-15' })
  dueDate: string | null;

  @ApiProperty({ type: Date, nullable: true })
  sentAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  paidAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  voidedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export function toInvoiceResponse(
  invoice: Invoice,
  now = new Date(),
): InvoiceResponseDto {
  return {
    id: invoice.id,
    number: formatInvoiceNumber(invoice.number),
    projectId: invoice.projectId,
    clientId: invoice.clientId,
    title: invoice.title,
    description: invoice.description,
    notes: invoice.notes,
    status: invoice.status,
    isOverdue: isOverdue(invoice, toDateOnly(now)),
    currency: invoice.currency,
    amount: invoice.amount,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    sentAt: invoice.sentAt,
    paidAt: invoice.paidAt,
    voidedAt: invoice.voidedAt,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}
