import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertStorable,
  fromHundredths,
  percentOf,
  toHundredths,
} from '../common/money';
import { Invoice, InvoiceStatus } from './invoice.entity';

export const DEFAULT_PAYMENT_DAYS = 14;

const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  [InvoiceStatus.Draft]: [InvoiceStatus.Sent],
  [InvoiceStatus.Sent]: [InvoiceStatus.Paid, InvoiceStatus.Void],
  [InvoiceStatus.Paid]: [],
  [InvoiceStatus.Void]: [],
};

export function assertInvoiceTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): void {
  if (!INVOICE_TRANSITIONS[from].includes(to)) {
    throw new ConflictException(`An invoice cannot go from ${from} to ${to}`);
  }
}

export function calculateInvoiceTotals(input: {
  amount: number;
  taxRate: number;
}): { taxAmount: number; total: number } {
  const amount = toHundredths(input.amount);
  const taxAmount = percentOf(amount, input.taxRate);
  const total = amount + taxAmount;
  assertStorable(total, 'total');
  return {
    taxAmount: fromHundredths(taxAmount),
    total: fromHundredths(total),
  };
}

export function formatInvoiceNumber(number: number | null): string | null {
  return number === null ? null : `INV-${String(number).padStart(4, '0')}`;
}

// Today's date as YYYY-MM-DD (UTC).
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

// A sent invoice is overdue once its due date has passed. YYYY-MM-DD strings
// compare the same way as the dates they stand for.
export function isOverdue(
  invoice: Pick<Invoice, 'status' | 'dueDate'>,
  today: string,
): boolean {
  return (
    invoice.status === InvoiceStatus.Sent &&
    invoice.dueDate !== null &&
    invoice.dueDate < today
  );
}

// Checks a draft and returns the fields to save when it is sent. The invoice
// number is added by the caller.
export function prepareInvoiceForSend(
  invoice: Pick<Invoice, 'status' | 'amount' | 'dueDate'>,
  now: Date,
) {
  assertInvoiceTransition(invoice.status, InvoiceStatus.Sent);
  if (toHundredths(invoice.amount) <= 0n) {
    throw new BadRequestException('The amount must be more than 0 to send');
  }

  const issueDate = toDateOnly(now);
  const dueDate = invoice.dueDate ?? addDays(issueDate, DEFAULT_PAYMENT_DAYS);
  if (dueDate < issueDate) {
    throw new BadRequestException('The due date cannot be before today');
  }

  return {
    status: InvoiceStatus.Sent,
    issueDate,
    dueDate,
    sentAt: now,
  };
}
