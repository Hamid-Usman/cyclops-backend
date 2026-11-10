import { applyDecorators } from '@nestjs/common';
import {
  IsISO8601,
  IsNumber,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_AMOUNT } from './money';

// A calendar date such as "2026-11-10", with no time part.
export function IsDateOnly() {
  return applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '$property must be YYYY-MM-DD' }),
    IsISO8601({ strict: true }),
  );
}

// Must contain at least one non-space character.
export function IsNotBlank() {
  return Matches(/\S/, { message: '$property must not be blank' });
}

// The field may be left out, but if it is sent it cannot be null.
export function IsOptionalNotNull() {
  return ValidateIf((_object, value) => value !== undefined);
}

// A money amount: zero or more, at most two decimals, e.g. 1935.5.
export function IsAmount() {
  return applyDecorators(
    IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }),
    Min(0),
    Max(MAX_AMOUNT),
  );
}

// A percent from 0 to 100 with at most two decimals, e.g. 7.5.
export function IsPercent() {
  return applyDecorators(
    IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }),
    Min(0),
    Max(100),
  );
}
