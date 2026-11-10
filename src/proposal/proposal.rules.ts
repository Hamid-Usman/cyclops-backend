import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  assertStorable,
  fromHundredths,
  mulDivRound,
  percentOf,
  toHundredths,
} from '../common/money';
import { Proposal, ProposalStatus } from './proposal.entity';

const PROPOSAL_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> =
  {
    [ProposalStatus.Draft]: [ProposalStatus.Sent, ProposalStatus.Superseded],
    [ProposalStatus.Sent]: [
      ProposalStatus.Viewed,
      ProposalStatus.Accepted,
      ProposalStatus.Declined,
      ProposalStatus.Expired,
      ProposalStatus.Withdrawn,
      ProposalStatus.Superseded,
    ],
    [ProposalStatus.Viewed]: [
      ProposalStatus.Accepted,
      ProposalStatus.Declined,
      ProposalStatus.Expired,
      ProposalStatus.Withdrawn,
      ProposalStatus.Superseded,
    ],
    [ProposalStatus.Accepted]: [],
    [ProposalStatus.Declined]: [],
    [ProposalStatus.Expired]: [],
    [ProposalStatus.Withdrawn]: [],
    [ProposalStatus.Superseded]: [],
  };

export function canTransitionProposal(
  from: ProposalStatus,
  to: ProposalStatus,
): boolean {
  return PROPOSAL_TRANSITIONS[from].includes(to);
}

export function assertProposalTransition(
  from: ProposalStatus,
  to: ProposalStatus,
): void {
  if (!canTransitionProposal(from, to)) {
    throw new ConflictException(`A proposal cannot go from ${from} to ${to}`);
  }
}

// --- Totals ---------------------------------------------------------------

export interface ProposalTotals {
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  deposit: number;
}

type PricedProposal = Pick<
  Proposal,
  'price' | 'discount' | 'taxRate' | 'depositPercent'
>;

// Price, minus discount, plus tax on what's left. The deposit is a percent
// of the final total.
export function calculateTotals(proposal: PricedProposal): ProposalTotals {
  const subtotal = toHundredths(proposal.price ?? 0);
  const discount = toHundredths(proposal.discount);
  if (discount > subtotal) {
    throw new BadRequestException('Discount cannot be more than the price');
  }
  const afterDiscount = subtotal - discount;
  const taxAmount = percentOf(afterDiscount, proposal.taxRate);
  const total = afterDiscount + taxAmount;
  const deposit = mulDivRound(total, BigInt(proposal.depositPercent), 100n);
  assertStorable(total, 'total');

  return {
    subtotal: fromHundredths(subtotal),
    discount: fromHundredths(discount),
    taxAmount: fromHundredths(taxAmount),
    total: fromHundredths(total),
    deposit: fromHundredths(deposit),
  };
}

// --- Sending --------------------------------------------------------------

export type ProposalSection =
  'problemStatement' | 'deliverables' | 'timeline' | 'cost' | 'terms';

export type SendableProposal = PricedProposal &
  Pick<
    Proposal,
    | 'status'
    | 'problemStatement'
    | 'deliverables'
    | 'estimatedDuration'
    | 'durationUnit'
    | 'terms'
    | 'validUntil'
  >;

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

// Lists the sections a draft still needs before it can be sent.
export function findMissingSections(
  proposal: SendableProposal,
): ProposalSection[] {
  const missing: ProposalSection[] = [];

  if (isBlank(proposal.problemStatement)) {
    missing.push('problemStatement');
  }
  if (isBlank(proposal.deliverables)) {
    missing.push('deliverables');
  }
  if (!proposal.estimatedDuration || !proposal.durationUnit) {
    missing.push('timeline');
  }
  if (
    proposal.price === null ||
    toHundredths(proposal.price) - toHundredths(proposal.discount) <= 0n
  ) {
    missing.push('cost');
  }
  if (isBlank(proposal.terms)) {
    missing.push('terms');
  }

  return missing;
}

export function hashTerms(terms: string): string {
  return createHash('sha256').update(terms, 'utf8').digest('hex');
}

// Checks a draft and returns the fields to save when it is sent.
export function prepareForSend(proposal: SendableProposal, now: Date) {
  assertProposalTransition(proposal.status, ProposalStatus.Sent);

  const missing = findMissingSections(proposal);
  if (missing.length > 0) {
    throw new BadRequestException({
      message: 'The proposal is missing required sections',
      missingSections: missing,
    });
  }
  if (proposal.validUntil && proposal.validUntil <= now) {
    throw new BadRequestException('The expiry date must be in the future');
  }

  const totals = calculateTotals(proposal);
  return {
    status: ProposalStatus.Sent,
    sentAt: now,
    termsHash: hashTerms(proposal.terms!),
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    total: totals.total,
    deposit: totals.deposit,
  };
}

// --- Client response ------------------------------------------------------

export function isExpired(
  proposal: Pick<Proposal, 'validUntil'>,
  now: Date,
): boolean {
  return proposal.validUntil !== null && proposal.validUntil <= now;
}

export function assertCanRespond(
  proposal: Pick<Proposal, 'status' | 'validUntil'>,
  to: ProposalStatus.Accepted | ProposalStatus.Declined,
  now: Date,
): void {
  assertProposalTransition(proposal.status, to);
  if (isExpired(proposal, now)) {
    throw new ConflictException('This proposal has expired');
  }
}

export function assertCanAccept(
  proposal: Pick<Proposal, 'status' | 'validUntil' | 'terms' | 'termsHash'>,
  input: { agreeToTerms: boolean },
  now: Date,
): void {
  assertCanRespond(proposal, ProposalStatus.Accepted, now);
  if (input.agreeToTerms !== true) {
    throw new BadRequestException('You must agree to the terms to accept');
  }
  if (
    proposal.terms === null ||
    proposal.termsHash !== hashTerms(proposal.terms)
  ) {
    throw new ConflictException(
      'The terms changed after this proposal was sent',
    );
  }
}
