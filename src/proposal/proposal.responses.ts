import { ApiProperty } from '@nestjs/swagger';
import { DurationUnit, Proposal, ProposalStatus } from './proposal.entity';
import {
  ProposalSection,
  ProposalTotals,
  calculateTotals,
  findMissingSections,
} from './proposal.rules';

const SECTIONS: ProposalSection[] = [
  'problemStatement',
  'deliverables',
  'timeline',
  'cost',
  'terms',
];

export class ProposalSummaryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  clientId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: ProposalStatus })
  status: ProposalStatus;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1935,
    description: 'Set once the proposal is sent',
  })
  total: number | null;

  @ApiProperty({ type: Date, nullable: true })
  validUntil: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  sentAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  respondedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ProposalTotalsResponseDto {
  @ApiProperty({ example: 2000 })
  subtotal: number;

  @ApiProperty({ example: 200 })
  discount: number;

  @ApiProperty({ example: 135 })
  taxAmount: number;

  @ApiProperty({ example: 1935 })
  total: number;

  @ApiProperty({ example: 967.5 })
  deposit: number;
}

export class ProposalResponseDto extends ProposalSummaryResponseDto {
  @ApiProperty({ type: String, nullable: true })
  problemStatement: string | null;

  @ApiProperty({ type: String, nullable: true })
  deliverables: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2026-12-01' })
  estimatedStartDate: string | null;

  @ApiProperty({ type: Number, nullable: true })
  estimatedDuration: number | null;

  @ApiProperty({ enum: DurationUnit, nullable: true })
  durationUnit: DurationUnit | null;

  @ApiProperty({ type: Number, nullable: true, example: 2000 })
  price: number | null;

  @ApiProperty({ example: 200 })
  discount: number;

  @ApiProperty({ example: 7.5, description: 'Percent: 7.5 means 7.5%' })
  taxRate: number;

  @ApiProperty({ example: 50 })
  depositPercent: number;

  @ApiProperty({
    type: ProposalTotalsResponseDto,
    nullable: true,
    description:
      'Saved totals once sent. For drafts, a preview (null if the discount is more than the price).',
  })
  totals: ProposalTotalsResponseDto | null;

  @ApiProperty({ type: String, nullable: true })
  terms: string | null;

  @ApiProperty({
    enum: SECTIONS,
    isArray: true,
    description: 'Sections still needed before a draft can be sent',
  })
  missingSections: ProposalSection[];

  @ApiProperty({ type: Date, nullable: true })
  viewedAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  acceptedByName: string | null;

  @ApiProperty({ type: Date, nullable: true })
  termsAcceptedAt: Date | null;

  @ApiProperty({ type: String, nullable: true })
  declineReason: string | null;
}

export function toProposalSummary(
  proposal: Proposal,
): ProposalSummaryResponseDto {
  return {
    id: proposal.id,
    projectId: proposal.projectId,
    clientId: proposal.clientId,
    title: proposal.title,
    status: proposal.status,
    currency: proposal.currency,
    total: proposal.total,
    validUntil: proposal.validUntil,
    sentAt: proposal.sentAt,
    respondedAt: proposal.respondedAt,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}

function totalsFor(proposal: Proposal): ProposalTotals | null {
  if (proposal.status !== ProposalStatus.Draft) {
    if (proposal.subtotal === null) {
      return null;
    }
    return {
      subtotal: proposal.subtotal,
      discount: proposal.discount,
      taxAmount: proposal.taxAmount ?? 0,
      total: proposal.total ?? 0,
      deposit: proposal.deposit ?? 0,
    };
  }
  try {
    return calculateTotals(proposal);
  } catch {
    return null;
  }
}

export function toProposalResponse(proposal: Proposal): ProposalResponseDto {
  return {
    ...toProposalSummary(proposal),
    problemStatement: proposal.problemStatement,
    deliverables: proposal.deliverables,
    estimatedStartDate: proposal.estimatedStartDate,
    estimatedDuration: proposal.estimatedDuration,
    durationUnit: proposal.durationUnit,
    price: proposal.price,
    discount: proposal.discount,
    taxRate: proposal.taxRate,
    depositPercent: proposal.depositPercent,
    totals: totalsFor(proposal),
    terms: proposal.terms,
    missingSections:
      proposal.status === ProposalStatus.Draft
        ? findMissingSections(proposal)
        : [],
    viewedAt: proposal.viewedAt,
    acceptedByName: proposal.acceptedByName,
    termsAcceptedAt: proposal.termsAcceptedAt,
    declineReason: proposal.declineReason,
  };
}
