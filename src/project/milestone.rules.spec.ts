import { DurationUnit } from '../proposal/proposal.entity';
import {
  assertPaymentSchedule,
  buildProjectSchedule,
  estimateDueDate,
  splitByPercent,
} from './milestone.rules';
import { MilestoneKind } from './project-milestone.entity';

const milestone = (percent: number, title = 'Step') => ({
  title,
  deliverables: null,
  percent,
  dueDate: null,
});

describe('assertPaymentSchedule', () => {
  it('accepts a deposit and milestones adding up to 100%', () => {
    expect(() =>
      assertPaymentSchedule(25, [milestone(37.5), milestone(37.5)]),
    ).not.toThrow();
  });

  it('allows no milestones at all (the rest is one balance)', () => {
    expect(() => assertPaymentSchedule(30, [])).not.toThrow();
  });

  it('says what the shares add up to when they are off', () => {
    expect(() => assertPaymentSchedule(20, [milestone(50)])).toThrow(
      'The deposit and milestones must add up to 100% (they add up to 70%)',
    );
  });

  it('refuses a milestone worth 0%', () => {
    expect(() =>
      assertPaymentSchedule(0, [milestone(100), milestone(0)]),
    ).toThrow('Every milestone needs a share above 0%');
  });
});

describe('buildProjectSchedule', () => {
  it('puts the deposit first, then the milestones', () => {
    const steps = buildProjectSchedule({
      depositPercent: 20,
      milestones: [milestone(80, 'Launch')],
    });
    expect(steps.map((step) => [step.kind, step.title, step.percent])).toEqual([
      [MilestoneKind.Deposit, 'Deposit', 20],
      [MilestoneKind.Milestone, 'Launch', 80],
    ]);
  });

  it('bills the rest as a balance when there are no milestones', () => {
    const steps = buildProjectSchedule({ depositPercent: 40, milestones: [] });
    expect(steps.map((step) => [step.kind, step.title, step.percent])).toEqual([
      [MilestoneKind.Deposit, 'Deposit', 40],
      [MilestoneKind.Balance, 'Balance on completion', 60],
    ]);
  });

  it('is one full payment with no deposit and no milestones', () => {
    const steps = buildProjectSchedule({ depositPercent: 0, milestones: [] });
    expect(steps).toEqual([
      expect.objectContaining({
        kind: MilestoneKind.Balance,
        title: 'Full payment',
        percent: 100,
      }),
    ]);
  });
});

describe('splitByPercent', () => {
  it('always adds up to exactly the amount', () => {
    // 100.00 split in thirds: 33.33 + 33.33 + 33.34
    expect(splitByPercent(10_000n, [33.33, 33.33, 33.34])).toEqual([
      3333n,
      3333n,
      3334n,
    ]);
    const parts = splitByPercent(193_501n, [25, 25, 50]);
    expect(parts.reduce((sum, part) => sum + part, 0n)).toBe(193_501n);
  });
});

describe('estimateDueDate', () => {
  it('adds the duration to the start date', () => {
    expect(estimateDueDate('2026-11-30', 3, DurationUnit.Days)).toBe(
      '2026-12-03',
    );
    expect(estimateDueDate('2026-12-01', 2, DurationUnit.Weeks)).toBe(
      '2026-12-15',
    );
    expect(estimateDueDate('2026-11-15', 3, DurationUnit.Months)).toBe(
      '2027-02-15',
    );
  });

  it('is unknown without a start date or duration', () => {
    expect(estimateDueDate(null, 3, DurationUnit.Days)).toBeNull();
    expect(estimateDueDate('2026-12-01', null, null)).toBeNull();
  });
});
