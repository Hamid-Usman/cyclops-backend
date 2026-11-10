import { ValueTransformer } from 'typeorm';

// MySQL/MariaDB return DECIMAL columns as strings. This turns them back into
// numbers.
export const numberTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null) =>
    value === null ? null : Number(value),
};

// A money amount with two decimals, e.g. 1935.50.
export const moneyColumn = {
  type: 'decimal',
  precision: 12,
  scale: 2,
  unsigned: true,
  transformer: numberTransformer,
} as const;
