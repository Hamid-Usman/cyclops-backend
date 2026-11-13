import { ProjectMilestone } from '../project/project-milestone.entity';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, DataSource, Not } from 'typeorm';
import { DashboardCache } from '../cache/dashboard-cache.service';
import { passThroughDashboardCache } from '../cache/dashboard-cache.mock-spec';
import { Invoice, InvoiceStatus } from '../invoice/invoice.entity';
import { Project, ProjectStatus } from '../project/project.entity';
import { Proposal, ProposalStatus } from '../proposal/proposal.entity';
import { ClientPortalService } from './client-portal.service';
import { Client, ClientStatus } from './client.entity';

const NOW = new Date('2026-11-12T12:00:00Z');
const user = { id: 'user-id', email: 'jane@example.com', displayName: 'Jane' };

function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'inv',
    number: 1,
    projectId: 'p1',
    clientId: 'client-id',
    title: 'Invoice',
    description: null,
    notes: null,
    status: InvoiceStatus.Sent,
    currency: 'USD',
    lineItems: [],
    amount: 100,
    taxRate: 0,
    taxAmount: 0,
    total: 100,
    issueDate: '2026-11-01',
    dueDate: '2026-11-30',
    ...overrides,
  } as unknown as Invoice;
}

describe('ClientPortalService', () => {
  let service: ClientPortalService;
  const clients = { find: jest.fn() };
  const projects = { find: jest.fn() };
  const proposals = { find: jest.fn() };
  const invoices = { find: jest.fn(), findOne: jest.fn() };
  const milestones = { find: jest.fn().mockResolvedValue([]) };
  const manager = { findOne: jest.fn(), update: jest.fn() };
  const dataSource = {
    transaction: jest.fn((work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
  };
  const dashboardCache = {
    ...passThroughDashboardCache(),
    // Passes straight through to the loader, like a cache miss.
    wrapForClients: jest.fn(
      (_clientIds: string[], _key: string, load: () => Promise<unknown>) =>
        load(),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ClientPortalService,
        { provide: getRepositoryToken(Client), useValue: clients },
        { provide: getRepositoryToken(Project), useValue: projects },
        { provide: getRepositoryToken(Proposal), useValue: proposals },
        { provide: getRepositoryToken(Invoice), useValue: invoices },
        {
          provide: getRepositoryToken(ProjectMilestone),
          useValue: milestones,
        },
        { provide: DataSource, useValue: dataSource },
        { provide: DashboardCache, useValue: dashboardCache },
      ],
    }).compile();
    service = module.get(ClientPortalService);

    clients.find.mockResolvedValue([
      {
        id: 'client-id',
        status: ClientStatus.Active,
        user: { ...user, passwordHash: 'secret' },
      },
    ]);
    projects.find.mockResolvedValue([
      { id: 'p1', clientId: 'client-id', status: ProjectStatus.Active },
      { id: 'p2', clientId: 'client-id', status: ProjectStatus.Inactive },
    ]);
    proposals.find.mockResolvedValue([
      { id: 'pr1', status: ProposalStatus.Viewed },
      { id: 'pr2', status: ProposalStatus.Accepted },
    ]);
    invoices.find.mockResolvedValue([
      invoice({ id: 'a', total: 0.1 }),
      invoice({ id: 'b', total: 0.2 }),
      invoice({ id: 'c', total: 50, dueDate: '2026-11-01' }),
      invoice({ id: 'd', total: 10, currency: 'EUR' }),
      invoice({ id: 'e', total: 999, status: InvoiceStatus.Paid }),
    ]);
  });

  it("refuses users who aren't clients", async () => {
    clients.find.mockResolvedValue([]);
    await expect(service.getOverview('someone')).rejects.toThrow(
      'You are not a client',
    );
  });

  it("only loads this client's shared records, never drafts", async () => {
    await service.getOverview('user-id', NOW);
    expect(clients.find).toHaveBeenCalledWith({
      where: { userId: 'user-id' },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
    expect(proposals.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId: In(['client-id']),
          status: Not(ProposalStatus.Draft),
        },
      }),
    );
    expect(invoices.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId: In(['client-id']),
          status: Not(InvoiceStatus.Draft),
        },
      }),
    );
  });

  it('caches the overview per person, per day', async () => {
    await service.getOverview('user-id', NOW);
    expect(dashboardCache.wrapForClients).toHaveBeenCalledWith(
      ['client-id'],
      'overview:2026-11-12',
      expect.any(Function),
      expect.any(Number),
    );
  });

  it('summarizes what is active, waiting and owed', async () => {
    const overview = await service.getOverview('user-id', NOW);

    expect(overview.client).toEqual({
      id: 'client-id',
      status: ClientStatus.Active,
      user,
    });
    expect(overview.summary).toEqual({
      activeProjects: 1,
      proposalsAwaitingResponse: 1,
      unpaidInvoices: 4,
      overdueInvoices: 1,
      amountDue: [
        { currency: 'EUR', amount: 10 },
        { currency: 'USD', amount: 50.3 },
      ],
    });
    expect(overview.projects).toHaveLength(2);
    expect(overview.proposals).toHaveLength(2);
    expect(overview.invoices).toHaveLength(5);
  });

  describe('reportPayment', () => {
    beforeEach(() => {
      invoices.findOne.mockImplementation(async () => invoice({ id: 'a' }));
    });

    it('records the report on a sent invoice and refreshes the owner dashboard', async () => {
      manager.findOne.mockResolvedValue(
        invoice({ id: 'a', ownerId: 'owner-id' } as Partial<Invoice>),
      );

      const result = await service.reportPayment('user-id', 'a', {
        reference: '  TRX-42 ',
      });

      expect(manager.findOne).toHaveBeenCalledWith(
        Invoice,
        expect.objectContaining({
          where: {
            id: 'a',
            clientId: In(['client-id']),
            status: Not(InvoiceStatus.Draft),
          },
        }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        Invoice,
        { id: 'a' },
        { paymentReportedAt: expect.any(Date), paymentReference: 'TRX-42' },
      );
      expect(dashboardCache.invalidate).toHaveBeenCalledWith('owner-id');
      expect(dashboardCache.invalidateClient).toHaveBeenCalledWith('client-id');
      expect(result.id).toBe('a');
    });

    it('refuses an invoice that is already paid', async () => {
      manager.findOne.mockResolvedValue(
        invoice({ id: 'a', status: InvoiceStatus.Paid }),
      );
      await expect(service.reportPayment('user-id', 'a', {})).rejects.toThrow(
        'This invoice is paid, so there is nothing to pay',
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it("hides other clients' invoices", async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(service.reportPayment('user-id', 'x', {})).rejects.toThrow(
        'Invoice not found',
      );
    });
  });
});
