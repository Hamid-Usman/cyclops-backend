import { DashboardCache } from '../cache/dashboard-cache.service';
import { passThroughDashboardCache } from '../cache/dashboard-cache.mock-spec';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Project, ProjectStatus } from '../project/project.entity';
import { Invoice, InvoiceLineItem, InvoiceStatus } from './invoice.entity';
import { InvoiceService } from './invoice.service';

const OWNER_ID = 'owner-id';
const INVOICE_ID = 'invoice-id';

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE_ID,
    ownerId: OWNER_ID,
    clientId: 'client-id',
    projectId: 'project-id',
    number: null,
    status: InvoiceStatus.Draft,
    title: 'Deposit',
    description: null,
    notes: null,
    currency: 'USD',
    amount: 1000,
    taxRate: 10,
    taxAmount: 100,
    total: 1100,
    issueDate: null,
    dueDate: null,
    sentAt: null,
    paidAt: null,
    voidedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Invoice;
}

describe('InvoiceService', () => {
  let service: InvoiceService;
  let invoice: Invoice;
  let project: Project | null;

  const invoices = { findOne: jest.fn(), find: jest.fn() };
  const manager = {
    findOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: getRepositoryToken(Invoice), useValue: invoices },
        { provide: DataSource, useValue: dataSource },
        {
          provide: DashboardCache,
          useValue: passThroughDashboardCache(),
        },
      ],
    }).compile();
    service = module.get(InvoiceService);

    invoice = makeInvoice();
    project = {
      id: 'project-id',
      clientId: 'client-id',
      status: ProjectStatus.Active,
    } as Project;
    manager.findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(entity === Invoice ? invoice : project),
    );
    manager.query.mockResolvedValue([{ max: null }]);
    invoices.findOne.mockImplementation(() => Promise.resolve(invoice));
  });

  describe('create', () => {
    it('starts a draft for the project and its client, with tax worked out', async () => {
      await service.create(OWNER_ID, {
        projectId: 'project-id',
        title: '  Deposit ',
        lineItems: [
          { description: 'Design', quantity: 1, unitPrice: 645 },
          { description: 'Build', quantity: 1.5, unitPrice: 215 },
        ],
        taxRate: 7.5,
      });

      expect(manager.insert).toHaveBeenCalledWith(
        Invoice,
        expect.objectContaining({
          ownerId: OWNER_ID,
          clientId: 'client-id',
          projectId: 'project-id',
          title: 'Deposit',
          status: InvoiceStatus.Draft,
          number: null,
          amount: 967.5,
          taxRate: 7.5,
          taxAmount: 72.56,
          total: 1040.06,
        }),
      );
    });

    it('saves the lines in order with their amounts', async () => {
      await service.create(OWNER_ID, {
        projectId: 'project-id',
        title: 'Deposit',
        lineItems: [
          { description: ' Design ', quantity: 1, unitPrice: 645 },
          { description: 'Build', quantity: 1.5, unitPrice: 215 },
        ],
      });

      const [entity, rows] = manager.insert.mock.calls[1] as [
        unknown,
        Partial<InvoiceLineItem>[],
      ];
      expect(entity).toBe(InvoiceLineItem);
      expect(rows).toEqual([
        expect.objectContaining({
          position: 0,
          description: 'Design',
          quantity: 1,
          unitPrice: 645,
          amount: 645,
        }),
        expect.objectContaining({
          position: 1,
          description: 'Build',
          quantity: 1.5,
          unitPrice: 215,
          amount: 322.5,
        }),
      ]);
      const invoiceId = (manager.insert.mock.calls[0][1] as Invoice).id;
      expect(rows.every((row) => row.invoiceId === invoiceId)).toBe(true);
    });

    it('refuses projects that are not active or completed', async () => {
      for (const status of [ProjectStatus.Inactive, ProjectStatus.Cancelled]) {
        project = { ...project!, status };
        await expect(
          service.create(OWNER_ID, {
            projectId: 'project-id',
            title: 'Deposit',
            lineItems: [{ description: 'Work', quantity: 1, unitPrice: 100 }],
          }),
        ).rejects.toThrow('Invoices are only for active or completed projects');
      }
      expect(manager.insert).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('replaces the lines and recalculates totals', async () => {
      await service.update(OWNER_ID, INVOICE_ID, {
        lineItems: [{ description: 'Build', quantity: 20, unitPrice: 100 }],
      });

      expect(manager.delete).toHaveBeenCalledWith(InvoiceLineItem, {
        invoiceId: INVOICE_ID,
      });
      expect(manager.insert).toHaveBeenCalledWith(InvoiceLineItem, [
        expect.objectContaining({ invoiceId: INVOICE_ID, amount: 2000 }),
      ]);
      expect(manager.update).toHaveBeenCalledWith(
        Invoice,
        { id: INVOICE_ID },
        { amount: 2000, taxAmount: 200, total: 2200 },
      );
    });

    it('leaves the lines alone when they are not sent', async () => {
      await service.update(OWNER_ID, INVOICE_ID, { title: 'Changed' });

      expect(manager.delete).not.toHaveBeenCalled();
      expect(manager.update).toHaveBeenCalledWith(
        Invoice,
        { id: INVOICE_ID },
        { title: 'Changed' },
      );
    });

    it('refuses to edit a sent invoice', async () => {
      invoice = makeInvoice({ status: InvoiceStatus.Sent, number: 1 });

      await expect(
        service.update(OWNER_ID, INVOICE_ID, { title: 'Changed' }),
      ).rejects.toThrow('Only draft invoices can be changed');
    });
  });

  describe('send', () => {
    it('gives the first invoice number 1', async () => {
      await service.send(OWNER_ID, INVOICE_ID);

      expect(manager.update).toHaveBeenCalledWith(
        Invoice,
        { id: INVOICE_ID },
        expect.objectContaining({
          status: InvoiceStatus.Sent,
          number: 1,
          issueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
    });

    it('continues from the highest number', async () => {
      manager.query.mockResolvedValue([{ max: 41 }]);

      await service.send(OWNER_ID, INVOICE_ID);

      expect(manager.update).toHaveBeenCalledWith(
        Invoice,
        { id: INVOICE_ID },
        expect.objectContaining({ number: 42 }),
      );
    });

    it('refuses when the project was cancelled', async () => {
      project = { ...project!, status: ProjectStatus.Cancelled };

      await expect(service.send(OWNER_ID, INVOICE_ID)).rejects.toThrow(
        'Invoices are only for active or completed projects',
      );
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('markPaid', () => {
    it('records the payment date', async () => {
      invoice = makeInvoice({ status: InvoiceStatus.Sent, number: 1 });
      const paidAt = new Date('2026-11-01T09:00:00Z');

      await service.markPaid(OWNER_ID, INVOICE_ID, { paidAt });

      expect(manager.update).toHaveBeenCalledWith(
        Invoice,
        { id: INVOICE_ID },
        { status: InvoiceStatus.Paid, paidAt },
      );
    });

    it('refuses a payment date in the future', async () => {
      invoice = makeInvoice({ status: InvoiceStatus.Sent, number: 1 });

      await expect(
        service.markPaid(OWNER_ID, INVOICE_ID, {
          paidAt: new Date(Date.now() + 86_400_000),
        }),
      ).rejects.toThrow('The payment date cannot be in the future');
    });

    it('refuses to mark a draft as paid', async () => {
      await expect(service.markPaid(OWNER_ID, INVOICE_ID, {})).rejects.toThrow(
        'An invoice cannot go from draft to paid',
      );
    });
  });

  it("hides other users' invoices", async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(service.void(OWNER_ID, INVOICE_ID)).rejects.toThrow(
      'Invoice not found',
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      Invoice,
      expect.objectContaining({ where: { id: INVOICE_ID, ownerId: OWNER_ID } }),
    );
  });
});
