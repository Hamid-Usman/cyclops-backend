import { BadRequestException } from '@nestjs/common';
import { toHundredths } from '../common/money';
import { DurationUnit } from '../proposal/proposal.entity';
import { MilestoneKind } from './project-milestone.entity';

export interface MilestoneInput {
  title: string;
  deliverables: string | null;
  percent: number;
  dueDate: string | null;
}

export interface ScheduleStep extends MilestoneInput {
  kind: MilestoneKind;
}

const HUNDRED_PERCENT = 10_000n; // 100.00% in hundredths

function sumPercents(percents: readonly number[]): bigint {
  return percents.reduce((sum, percent) => sum + toHundredths(percent), 0n);
}

/**
 * A proposal with milestones must bill exactly 100%: the deposit plus every
 * milestone. Without milestones, whatever the deposit leaves is billed as one
 * balance, so there is nothing to check.
 */
export function assertPaymentSchedule(
  depositPercent: number,
  milestones: readonly { percent: number }[],
): void {
  if (milestones.length === 0) {
    return;
  }
  if (milestones.some((milestone) => toHundredths(milestone.percent) <= 0n)) {
    throw new BadRequestException('Every milestone needs a share above 0%');
  }
  const total =
    toHundredths(depositPercent) +
    sumPercents(milestones.map((milestone) => milestone.percent));
  if (total !== HUNDRED_PERCENT) {
    throw new BadRequestException(
      `The deposit and milestones must add up to 100% (they add up to ${Number(total) / 100}%)`,
    );
  }
}

/** The billable steps of a project generated from an accepted proposal. */
export function buildProjectSchedule(proposal: {
  depositPercent: number;
  milestones: readonly MilestoneInput[];
}): ScheduleStep[] {
  const steps: ScheduleStep[] = [];
  if (proposal.depositPercent > 0) {
    steps.push({
      kind: MilestoneKind.Deposit,
      title: 'Deposit',
      deliverables: null,
      percent: proposal.depositPercent,
      dueDate: null,
    });
  }

  if (proposal.milestones.length > 0) {
    for (const milestone of proposal.milestones) {
      steps.push({ kind: MilestoneKind.Milestone, ...milestone });
    }
    return steps;
  }

  const rest = 100 - proposal.depositPercent;
  if (rest > 0) {
    steps.push({
      kind: MilestoneKind.Balance,
      title:
        proposal.depositPercent > 0 ? 'Balance on completion' : 'Full payment',
      deliverables: null,
      percent: rest,
      dueDate: null,
    });
  }
  return steps;
}

/**
 * Splits an amount (in hundredths) by percents that add up to 100%. Each part
 * is rounded half up, and the last part takes the remainder, so the parts
 * always add up to exactly the amount.
 */
export function splitByPercent(
  amount: bigint,
  percents: readonly number[],
): bigint[] {
  let allocated = 0n;
  return percents.map((percent, index) => {
    if (index === percents.length - 1) {
      return amount - allocated;
    }
    const part =
      (amount * toHundredths(percent) * 2n + HUNDRED_PERCENT) /
      (HUNDRED_PERCENT * 2n);
    allocated += part;
    return part;
  });
}

/** Start date plus the estimated duration, as YYYY-MM-DD (UTC). */
export function estimateDueDate(
  startDate: string | null,
  duration: number | null,
  unit: DurationUnit | null,
): string | null {
  if (!startDate || !duration || !unit) {
    return null;
  }
  const date = new Date(`${startDate}T00:00:00Z`);
  if (unit === DurationUnit.Days) date.setUTCDate(date.getUTCDate() + duration);
  if (unit === DurationUnit.Weeks)
    date.setUTCDate(date.getUTCDate() + duration * 7);
  if (unit === DurationUnit.Months)
    date.setUTCMonth(date.getUTCMonth() + duration);
  return date.toISOString().slice(0, 10);
}
