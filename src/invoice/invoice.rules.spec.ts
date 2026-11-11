import { InvoiceStatus } from './invoice.entity';
import {
  addDays,
  assertInvoiceTransition,
  calculateInvoiceTotals,
  calculateLineItems,
  formatInvoiceNumber,
  isOverdue,
  prepareInvoiceForSend,
} from './invoice.rules';

const NOW = new Date('2026-11-10T12:00:00Z');

describe('invoice rules', () => {
  it('follows draft → sent → paid or void', () => {
    expect(() =>
      assertInvoiceTransition(InvoiceStatus.Draft, InvoiceStatus.Sent),
    ).not.toThrow();
    expect(() =>
      assertInvoiceTransition(InvoiceStatus.Sent, InvoiceStatus.Paid),
    ).not.toThrow();
    expect(() =>
      assertInvoiceTransition(InvoiceStatus.Sent, InvoiceStatus.Void),
    ).not.toThrow();
  });

  it('does not let a draft be paid or a paid invoice be voided', () => {
    expect(() =>
      assertInvoiceTransition(InvoiceStatus.Draft, InvoiceStatus.Paid),
    ).toThrow('An invoice cannot go from draft to paid');
    expect(() =>
      assertInvoiceTransition(InvoiceStatus.Paid, InvoiceStatus.Void),
    ).toThrow('An invoice cannot go from paid to void');
  });

  it('adds tax rounded to two decimals', () => {
    expect(calculateInvoiceTotals({ amount: 967.5, taxRate: 7.5 })).toEqual({
      taxAmount: 72.56,
      total: 1040.06,
    });
    expect(calculateInvoiceTotals({ amount: 100, taxRate: 0 })).toEqual({
      taxAmount: 0,
      total: 100,
    });
  });

  it('works out line amounts and their sum', () => {
    const { lines, amount } = calculateLineItems([
      { description: ' Design ', quantity: 1, unitPrice: 645 },
      { description: 'Build', quantity: 1.5, unitPrice: 215 },
      // 0.33 × 10.05 = 3.3165, rounded half up
      { description: 'Hosting', quantity: 0.33, unitPrice: 10.05 },
    ]);
    expect(lines.map((line) => line.amount)).toEqual([645, 322.5, 3.32]);
    expect(lines.map((line) => line.position)).toEqual([0, 1, 2]);
    expect(lines[0].description).toBe('Design');
    expect(amount).toBe(970.82);
  });

  it('refuses lines whose total is too large to store', () => {
    expect(() =>
      calculateLineItems([
        { description: 'Big', quantity: 2, unitPrice: 9_999_999_999.99 },
      ]),
    ).toThrow('The amount of line 1 cannot be more than');
  });

  it('formats invoice numbers', () => {
    expect(formatInvoiceNumber(1)).toBe('INV-0001');
    expect(formatInvoiceNumber(12345)).toBe('INV-12345');
    expect(formatInvoiceNumber(null)).toBeNull();
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-11-25', 14)).toBe('2026-12-09');
  });

  it('marks sent invoices overdue only after the due date', () => {
    const sent = { status: InvoiceStatus.Sent, dueDate: '2026-11-10' };
    expect(isOverdue(sent, '2026-11-10')).toBe(false);
    expect(isOverdue(sent, '2026-11-11')).toBe(true);
    expect(
      isOverdue({ ...sent, status: InvoiceStatus.Paid }, '2026-12-01'),
    ).toBe(false);
  });

  describe('prepareInvoiceForSend', () => {
    const draft = {
      status: InvoiceStatus.Draft,
      amount: 500,
      dueDate: null,
    };

    it('sets the issue date to today and the due date 14 days later', () => {
      expect(prepareInvoiceForSend(draft, NOW)).toEqual({
        status: InvoiceStatus.Sent,
        issueDate: '2026-11-10',
        dueDate: '2026-11-24',
        sentAt: NOW,
      });
    });

    it('keeps a due date that was set', () => {
      expect(
        prepareInvoiceForSend({ ...draft, dueDate: '2026-12-01' }, NOW).dueDate,
      ).toBe('2026-12-01');
    });

    it('refuses a zero amount', () => {
      expect(() => prepareInvoiceForSend({ ...draft, amount: 0 }, NOW)).toThrow(
        'The amount must be more than 0 to send',
      );
    });

    it('refuses a due date in the past', () => {
      expect(() =>
        prepareInvoiceForSend({ ...draft, dueDate: '2026-11-01' }, NOW),
      ).toThrow('The due date cannot be before today');
    });

    it('refuses an invoice that was already sent', () => {
      expect(() =>
        prepareInvoiceForSend({ ...draft, status: InvoiceStatus.Sent }, NOW),
      ).toThrow('An invoice cannot go from sent to sent');
    });
  });
});
