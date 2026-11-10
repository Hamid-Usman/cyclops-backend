import { BadRequestException } from '@nestjs/common';
import { MAX_AMOUNT } from '../common/money';
import { DurationUnit, ProposalStatus } from './proposal.entity';
import {
  SendableProposal,
  assertCanAccept,
  assertCanRespond,
  assertProposalTransition,
  calculateTotals,
  findMissingSections,
  hashTerms,
  prepareForSend,
} from './proposal.rules';

const NOW = new Date('2026-11-10T12:00:00Z');

function completeDraft(
  overrides: Partial<SendableProposal> = {},
): SendableProposal {
  return {
    status: ProposalStatus.Draft,
    problemStatement: 'Checkout is slow and customers leave.',
    deliverables: 'A new checkout flow.',
    estimatedDuration: 6,
    durationUnit: DurationUnit.Weeks,
    price: 5000,
    discount: 0,
    taxRate: 0,
    depositPercent: 0,
    terms: '50% upfront, rest on delivery.',
    validUntil: new Date('2026-12-01T00:00:00Z'),
    ...overrides,
  };
}

const pricing = { discount: 0, taxRate: 0, depositPercent: 0 };

describe('proposal status transitions', () => {
  it('allows the normal path from draft to accepted', () => {
    expect(() =>
      assertProposalTransition(ProposalStatus.Draft, ProposalStatus.Sent),
    ).not.toThrow();
    expect(() =>
      assertProposalTransition(ProposalStatus.Sent, ProposalStatus.Viewed),
    ).not.toThrow();
    expect(() =>
      assertProposalTransition(ProposalStatus.Viewed, ProposalStatus.Accepted),
    ).not.toThrow();
  });

  it('does not let a draft be accepted without being sent', () => {
    expect(() =>
      assertProposalTransition(ProposalStatus.Draft, ProposalStatus.Accepted),
    ).toThrow('A proposal cannot go from draft to accepted');
  });

  it('treats accepted, declined, expired, withdrawn and superseded as final', () => {
    const finals = [
      ProposalStatus.Accepted,
      ProposalStatus.Declined,
      ProposalStatus.Expired,
      ProposalStatus.Withdrawn,
      ProposalStatus.Superseded,
    ];
    for (const from of finals) {
      for (const to of Object.values(ProposalStatus)) {
        expect(() => assertProposalTransition(from, to)).toThrow();
      }
    }
  });
});

describe('calculateTotals', () => {
  it('applies discount, then tax, then works out the deposit', () => {
    expect(
      calculateTotals({
        price: 2000,
        discount: 200,
        taxRate: 7.5,
        depositPercent: 50,
      }),
    ).toEqual({
      subtotal: 2000,
      discount: 200,
      taxAmount: 135,
      total: 1935,
      deposit: 967.5,
    });
  });

  it('avoids float errors', () => {
    // In plain JavaScript, 0.3 - 0.1 is 0.19999999999999998.
    expect(
      calculateTotals({ ...pricing, price: 0.3, discount: 0.1 }).total,
    ).toBe(0.2);
  });

  it('rounds tax to two decimals', () => {
    // 10.01 × 8.25% = 0.825825
    const totals = calculateTotals({ ...pricing, price: 10.01, taxRate: 8.25 });
    expect(totals.taxAmount).toBe(0.83);
    expect(totals.total).toBe(10.84);
  });

  it('treats a missing price as zero', () => {
    expect(calculateTotals({ ...pricing, price: null }).total).toBe(0);
  });

  it('rejects a discount larger than the price', () => {
    expect(() =>
      calculateTotals({ ...pricing, price: 1, discount: 1.01 }),
    ).toThrow('Discount cannot be more than the price');
  });

  it('rejects a total too large to store', () => {
    expect(() =>
      calculateTotals({ ...pricing, price: MAX_AMOUNT, taxRate: 10 }),
    ).toThrow(`The total cannot be more than ${MAX_AMOUNT}`);
  });
});

describe('findMissingSections', () => {
  it('returns nothing for a complete draft', () => {
    expect(findMissingSections(completeDraft())).toEqual([]);
  });

  it('lists every empty section', () => {
    expect(
      findMissingSections(
        completeDraft({
          problemStatement: '   ',
          deliverables: null,
          estimatedDuration: null,
          price: null,
          terms: null,
        }),
      ),
    ).toEqual([
      'problemStatement',
      'deliverables',
      'timeline',
      'cost',
      'terms',
    ]);
  });

  it('needs both a duration and a unit for the timeline', () => {
    expect(findMissingSections(completeDraft({ durationUnit: null }))).toEqual([
      'timeline',
    ]);
  });

  it('counts the cost as missing when the discount uses up the price', () => {
    expect(findMissingSections(completeDraft({ discount: 5000 }))).toEqual([
      'cost',
    ]);
  });
});

describe('prepareForSend', () => {
  it('returns the sent status, totals and terms hash', () => {
    const draft = completeDraft({ taxRate: 10, depositPercent: 30 });

    expect(prepareForSend(draft, NOW)).toEqual({
      status: ProposalStatus.Sent,
      sentAt: NOW,
      termsHash: hashTerms(draft.terms!),
      subtotal: 5000,
      taxAmount: 500,
      total: 5500,
      deposit: 1650,
    });
  });

  it('reports the missing sections so the UI can point at them', () => {
    let error: unknown;
    try {
      prepareForSend(completeDraft({ terms: '', deliverables: '' }), NOW);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      message: 'The proposal is missing required sections',
      missingSections: ['deliverables', 'terms'],
    });
  });

  it('refuses a proposal that was already sent', () => {
    expect(() =>
      prepareForSend(completeDraft({ status: ProposalStatus.Sent }), NOW),
    ).toThrow('A proposal cannot go from sent to sent');
  });

  it('refuses an expiry date in the past', () => {
    expect(() =>
      prepareForSend(
        completeDraft({ validUntil: new Date('2026-11-01T00:00:00Z') }),
        NOW,
      ),
    ).toThrow('The expiry date must be in the future');
  });
});

describe('client response', () => {
  const terms = '50% upfront, rest on delivery.';
  const sent = {
    status: ProposalStatus.Sent,
    validUntil: new Date('2026-12-01T00:00:00Z'),
    terms,
    termsHash: hashTerms(terms),
  };

  it('accepts a sent proposal when the client agrees to the terms', () => {
    expect(() =>
      assertCanAccept(sent, { agreeToTerms: true }, NOW),
    ).not.toThrow();
  });

  it('requires the client to agree to the terms', () => {
    expect(() => assertCanAccept(sent, { agreeToTerms: false }, NOW)).toThrow(
      'You must agree to the terms to accept',
    );
  });

  it('refuses an expired proposal', () => {
    expect(() =>
      assertCanAccept(
        sent,
        { agreeToTerms: true },
        new Date('2026-12-02T00:00:00Z'),
      ),
    ).toThrow('This proposal has expired');
  });

  it('refuses when the terms no longer match what was sent', () => {
    expect(() =>
      assertCanAccept(
        { ...sent, terms: 'Full payment upfront.' },
        { agreeToTerms: true },
        NOW,
      ),
    ).toThrow('The terms changed after this proposal was sent');
  });

  it('refuses withdrawn or declined proposals', () => {
    for (const status of [ProposalStatus.Withdrawn, ProposalStatus.Declined]) {
      expect(() =>
        assertCanAccept({ ...sent, status }, { agreeToTerms: true }, NOW),
      ).toThrow();
    }
  });

  it('lets a viewed proposal be declined', () => {
    expect(() =>
      assertCanRespond(
        { ...sent, status: ProposalStatus.Viewed },
        ProposalStatus.Declined,
        NOW,
      ),
    ).not.toThrow();
  });
});
