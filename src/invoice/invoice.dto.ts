import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination';
import {
  IsAmount,
  IsDateOnly,
  IsNotBlank,
  IsOptionalNotNull,
  IsPercent,
} from '../common/validation';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { formatInvoiceNumber, isOverdue, toDateOnly } from './invoice.rules';

export const MAX_LINE_ITEMS = 100;

export class InvoiceLineItemInputDto {
  @ApiProperty({ example: 'Checkout page design', maxLength: 500 })
  @IsString()
  @IsNotBlank()
  @MaxLength(500)
  description: string;

  @ApiProperty({
    example: 1.5,
    description: 'More than 0, up to two decimals, e.g. hours',
  })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(99_999_999.99)
  quantity: number;

  @ApiProperty({ example: 645 })
  @IsAmount()
  unitPrice: number;
}

function LineItems() {
  return applyDecorators(
    IsArray(),
    ArrayMinSize(1),
    ArrayMaxSize(MAX_LINE_ITEMS),
    ValidateNested({ each: true }),
    Type(() => InvoiceLineItemInputDto),
  );
}

class InvoiceFieldsDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 10000,
    description: 'Shown to the client, e.g. bank details',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string | null;

  @ApiPropertyOptional({ example: 'USD', description: 'ISO 4217 code' })
  @IsOptionalNotNull()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' })
  currency?: string;

  @ApiPropertyOptional({
    example: 7.5,
    description: 'Tax as a percent: 7.5 means 7.5%',
  })
  @IsOptionalNotNull()
  @IsPercent()
  taxRate?: number;

  @ApiPropertyOptional({
    example: '2026-12-15',
    nullable: true,
    description: 'Defaults to 14 days after sending',
  })
  @IsOptional()
  @IsDateOnly()
  dueDate?: string | null;
}

export class CreateInvoiceDto extends InvoiceFieldsDto {
  @ApiProperty({ description: 'An active or completed project' })
  @IsUUID()
  projectId: string;

  @ApiProperty({ example: 'Deposit for checkout redesign', maxLength: 200 })
  @IsString()
  @IsNotBlank()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    type: [InvoiceLineItemInputDto],
    description: `1 to ${MAX_LINE_ITEMS} lines. Their sum is the amount before tax.`,
  })
  @LineItems()
  lineItems: InvoiceLineItemInputDto[];
}

export class UpdateInvoiceDto extends InvoiceFieldsDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptionalNotNull()
  @IsString()
  @IsNotBlank()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    type: [InvoiceLineItemInputDto],
    description: 'Replaces all of the lines',
  })
  @IsOptionalNotNull()
  @LineItems()
  lineItems?: InvoiceLineItemInputDto[];
}

// Bills one step of a project's payment schedule.
export class CreateInvoiceFromMilestoneDto {
  @ApiProperty({
    description: 'A project milestone (deposit, milestone or balance)',
  })
  @IsUUID()
  milestoneId: string;
}

// The client's note that they paid an invoice.
export class ReportPaymentDto {
  @ApiPropertyOptional({
    example: 'Bank transfer 2026-11-12, ref 88213',
    maxLength: 200,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string | null;
}

export class MarkInvoicePaidDto {
  @ApiPropertyOptional({
    type: Date,
    description: 'When the payment arrived. Defaults to now.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paidAt?: Date;
}

export class ListInvoicesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({
    description: 'Only sent invoices past their due date',
  })
  @IsOptional()
  @Type(() => String)
  @Matches(/^(true|false)$/)
  overdue?: 'true' | 'false';
}

export class InvoiceLineItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Checkout page design' })
  description: string;

  @ApiProperty({ example: 1.5 })
  quantity: number;

  @ApiProperty({ example: 645 })
  unitPrice: number;

  @ApiProperty({ example: 967.5, description: 'quantity × unitPrice' })
  amount: number;
}

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

  @ApiProperty({ type: [InvoiceLineItemResponseDto] })
  lineItems: InvoiceLineItemResponseDto[];

  @ApiProperty({
    example: 967.5,
    description: 'Before tax: the sum of the line amounts',
  })
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

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'When the client reported paying it',
  })
  paymentReportedAt: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The client's payment reference, e.g. a bank transfer id",
  })
  paymentReference: string | null;

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
    lineItems: (invoice.lineItems ?? []).map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
    })),
    amount: invoice.amount,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    sentAt: invoice.sentAt,
    paidAt: invoice.paidAt,
    voidedAt: invoice.voidedAt,
    paymentReportedAt: invoice.paymentReportedAt ?? null,
    paymentReference: invoice.paymentReference ?? null,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}
