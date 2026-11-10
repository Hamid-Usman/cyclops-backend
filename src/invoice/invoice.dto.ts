import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  IsAmount,
  IsDateOnly,
  IsNotBlank,
  IsOptionalNotNull,
  IsPercent,
} from '../common/validation';
import { InvoiceStatus } from './invoice.entity';

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

  @ApiProperty({ example: 967.5, description: 'Before tax' })
  @IsAmount()
  amount: number;
}

export class UpdateInvoiceDto extends InvoiceFieldsDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptionalNotNull()
  @IsString()
  @IsNotBlank()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: 967.5, description: 'Before tax' })
  @IsOptionalNotNull()
  @IsAmount()
  amount?: number;
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

export class ListInvoicesQueryDto {
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
