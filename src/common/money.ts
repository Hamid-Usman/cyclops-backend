import { BadRequestException } from '@nestjs/common';

// Money is stored as DECIMAL(12,2): two decimals, up to this value.
export const MAX_AMOUNT = 9_999_999_999.99;

// Calculations run on whole hundredths (BigInt), so float errors like
// 0.1 + 0.2 can't creep into totals. Values go back to normal amounts at the
// end with fromHundredths.
export function toHundredths(value: number): bigint {
  return BigInt(Math.round(value * 100));
}

export function fromHundredths(value: bigint): number {
  return Number(value) / 100;
}

// a * b / divisor, rounded half up. Inputs are never negative here.
export function mulDivRound(a: bigint, b: bigint, divisor: bigint): bigint {
  return (a * b * 2n + divisor) / (divisor * 2n);
}

// `percent` may have two decimals, e.g. 7.5 for 7.5%.
export function percentOf(amount: bigint, percent: number): bigint {
  return mulDivRound(amount, toHundredths(percent), 10_000n);
}

export function assertStorable(amount: bigint, label: string): void {
  if (amount > toHundredths(MAX_AMOUNT)) {
    throw new BadRequestException(
      `The ${label} cannot be more than ${MAX_AMOUNT}`,
    );
  }
}
