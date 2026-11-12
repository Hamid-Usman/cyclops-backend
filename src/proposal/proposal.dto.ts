import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  IsAmount,
  IsDateOnly,
  IsNotBlank,
  IsOptionalNotNull,
  IsPercent,
} from '../common/validation';
import { DurationUnit, ProposalStatus } from './proposal.entity';

export const MAX_MILESTONES = 20;

// One step of the payment schedule.
export class ProposalMilestoneInputDto {
  @ApiProperty({ example: 'Design approved', maxLength: 200 })
  @IsString()
  @IsNotBlank()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    example: 'Wireframes and visual design for all pages',
    nullable: true,
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  deliverables?: string | null;

  @ApiProperty({
    example: 25,
    description: 'Share of the total, up to two decimals',
  })
  @IsPercent()
  percent: number;

  @ApiPropertyOptional({ example: '2026-12-20', nullable: true })
  @IsOptional()
  @IsDateOnly()
  dueDate?: string | null;
}

// Fields shared by create and edit. Anything can be left empty on a draft;
// all five sections are checked when the proposal is sent.
class ProposalFieldsDto {
  @ApiPropertyOptional({
    description: '1. What problem are you solving?',
    nullable: true,
    maxLength: 20000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  problemStatement?: string | null;

  @ApiPropertyOptional({
    description: '2. What exactly will you deliver?',
    example: 'A redesigned 3-step checkout, mobile layouts and handover docs.',
    nullable: true,
    maxLength: 20000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  deliverables?: string | null;

  @ApiPropertyOptional({
    description: '3. How long will it take? Planned start date.',
    example: '2026-12-01',
    nullable: true,
  })
  @IsOptional()
  @IsDateOnly()
  estimatedStartDate?: string | null;

  @ApiPropertyOptional({
    description: '3. How long will it take? Counted in durationUnit.',
    example: 6,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  estimatedDuration?: number | null;

  @ApiPropertyOptional({ enum: DurationUnit, nullable: true })
  @IsOptional()
  @IsEnum(DurationUnit)
  durationUnit?: DurationUnit | null;

  @ApiPropertyOptional({
    description: '4. How much will it cost? The price before discount and tax.',
    example: 2000,
    nullable: true,
  })
  @IsOptional()
  @IsAmount()
  price?: number | null;

  @ApiPropertyOptional({ example: 'USD', description: 'ISO 4217 code' })
  @IsOptionalNotNull()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' })
  currency?: string;

  @ApiPropertyOptional({
    example: 200,
    description: 'Amount taken off the price, up to two decimals',
  })
  @IsOptionalNotNull()
  @IsAmount()
  discount?: number;

  @ApiPropertyOptional({
    example: 7.5,
    description: 'Tax as a percent, up to two decimals: 7.5 means 7.5%',
  })
  @IsOptionalNotNull()
  @IsPercent()
  taxRate?: number;

  @ApiPropertyOptional({ example: 50, description: 'Percent of the total' })
  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(100)
  depositPercent?: number;

  @ApiPropertyOptional({
    description: '5. What terms must the client agree to?',
    nullable: true,
    maxLength: 50000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  terms?: string | null;

  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: 'After this the client can no longer accept',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  validUntil?: Date | null;

  @ApiPropertyOptional({
    type: [ProposalMilestoneInputDto],
    description: `Payment schedule, up to ${MAX_MILESTONES} milestones. With milestones, the deposit plus all milestones must add up to 100% when sent. Without, the rest after the deposit is billed as one balance. Sending a list replaces the old one.`,
  })
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(MAX_MILESTONES)
  @ValidateNested({ each: true })
  @Type(() => ProposalMilestoneInputDto)
  milestones?: ProposalMilestoneInputDto[];
}

// Either for an existing inactive project, or for a client: then accepting
// the proposal creates the project.
export class CreateProposalDto extends ProposalFieldsDto {
  @ApiPropertyOptional({
    description: 'An inactive project this proposal is for',
  })
  @ValidateIf((dto: CreateProposalDto) => dto.clientId === undefined)
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description:
      'The client, when there is no project yet. Accepting creates the project.',
  })
  @ValidateIf((dto: CreateProposalDto) => dto.projectId === undefined)
  @IsUUID()
  clientId?: string;

  @ApiProperty({ example: 'Checkout redesign proposal', maxLength: 200 })
  @IsString()
  @IsNotBlank()
  @MaxLength(200)
  title: string;
}

export class UpdateProposalDto extends ProposalFieldsDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptionalNotNull()
  @IsString()
  @IsNotBlank()
  @MaxLength(200)
  title?: string;
}

export class ListProposalsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ enum: ProposalStatus })
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;
}

// The client's answer to a sent proposal.
export class AcceptProposalDto {
  @ApiProperty({
    example: true,
    description: 'Must be true: the client agrees to the proposal terms',
  })
  @IsBoolean()
  agreeToTerms: boolean;

  @ApiProperty({
    example: 'Jane Client',
    maxLength: 120,
    description: 'Typed signature: the full name of the person accepting',
  })
  @IsString()
  @IsNotBlank()
  @MaxLength(120)
  signatureName: string;
}

export class DeclineProposalDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reason?: string | null;
}
