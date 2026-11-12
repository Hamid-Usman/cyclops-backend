import { DashboardCache } from '../cache/dashboard-cache.service';
import { Test } from '@nestjs/testing';
import { LessThanOrEqual } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Invoice, InvoiceStatus } from '../invoice/invoice.entity';
import { Project, ProjectStatus } from '../project/project.entity';
import { Proposal, ProposalStatus } from '../proposal/proposal.entity';
import { DashboardService } from './dashboard.service';

const OWNER_ID = 'owner-id';

// A query builder whose chain methods return itself.
function makeQueryBuilder(result: { raw?: unknown; rows?: unknown[] }) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'setParameter',
    'groupBy',
    'orderBy',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.getRawOne = jest.fn(() => Promise.resolve(result.raw));
  builder.getRawMany = jest.fn(() => Promise.resolve(result.rows ?? []));
  return builder;
}

describe('DashboardService', () => {
  let service: DashboardService;
  let clientsQuery: ReturnType<typeof makeQueryBuilder>;
  let invoicesQuery: ReturnType<typeof makeQueryBuilder>;
  let proposalsQuery: ReturnType<typeof makeQueryBuilder>;

  const projects = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };
  const invoices = { createQueryBuilder: jest.fn(), find: jest.fn() };
  const proposals = { createQueryBuilder: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Project), useValue: projects },
        { provide: getRepositoryToken(Invoice), useValue: invoices },
        { provide: getRepositoryToken(Proposal), useValue: proposals },
        {
          provide: DashboardCache,
          useValue: {
            wrap: (_owner: string, _key: string, load: () => unknown) => load(),
          },
        },
      ],
    }).compile();
    service = module.get(DashboardService);

    clientsQuery = makeQueryBuilder({ raw: { count: '3' } });
    invoicesQuery = makeQueryBuilder({
      rows: [
        { currency: 'EUR', count: '1', overdue: '0', total: '500.00' },
        { currency: 'USD', count: '2', overdue: '1', total: '1580.12' },
      ],
    });
    proposalsQuery = makeQueryBuilder({
      rows: [
        { status: ProposalStatus.Draft, count: '2' },
        { status: ProposalStatus.Sent, count: '1' },
        { status: ProposalStatus.Viewed, count: '1' },
        { status: ProposalStatus.Accepted, count: '1' },
        { status: ProposalStatus.Declined, count: '1' },
      ],
    });
    proposals.createQueryBuilder.mockReturnValue(proposalsQuery);
    projects.createQueryBuilder.mockReturnValue(clientsQuery);
    invoices.createQueryBuilder.mockReturnValue(invoicesQuery);
    projects.count.mockResolvedValue(2);
  });

  it('returns the counts and pending totals per currency', async () => {
    const summary = await service.getSummary(
      OWNER_ID,
      new Date('2026-11-10T12:00:00Z'),
    );

    expect(summary).toEqual({
      activeClients: 3,
      activeProjects: 2,
      pendingInvoices: {
        count: 3,
        overdueCount: 1,
        totals: [
          { currency: 'EUR', amount: 500 },
          { currency: 'USD', amount: 1580.12 },
        ],
      },
      proposals: { total: 6, drafts: 2, awaitingResponse: 2, accepted: 1 },
    });
    expect(proposalsQuery.where).toHaveBeenCalledWith(
      'proposal.ownerId = :ownerId',
      { ownerId: OWNER_ID },
    );
  });

  it('only counts your active projects', async () => {
    await service.getSummary(OWNER_ID);
    expect(projects.count).toHaveBeenCalledWith({
      where: { ownerId: OWNER_ID, status: ProjectStatus.Active },
    });
  });

  it('only counts your sent invoices, overdue against today', async () => {
    await service.getSummary(OWNER_ID, new Date('2026-11-10T12:00:00Z'));
    expect(invoicesQuery.where).toHaveBeenCalledWith(
      'invoice.ownerId = :ownerId',
      { ownerId: OWNER_ID },
    );
    expect(invoicesQuery.andWhere).toHaveBeenCalledWith(
      'invoice.status = :status',
      { status: InvoiceStatus.Sent },
    );
    expect(invoicesQuery.setParameter).toHaveBeenCalledWith(
      'today',
      '2026-11-10',
    );
  });

  it('returns zeros when there is nothing yet', async () => {
    clientsQuery.getRawOne.mockResolvedValue(undefined);
    invoicesQuery.getRawMany.mockResolvedValue([]);
    projects.count.mockResolvedValue(0);
    proposalsQuery.getRawMany.mockResolvedValue([]);

    expect(await service.getSummary(OWNER_ID)).toEqual({
      activeClients: 0,
      activeProjects: 0,
      pendingInvoices: { count: 0, overdueCount: 0, totals: [] },
      proposals: { total: 0, drafts: 0, awaitingResponse: 0, accepted: 0 },
    });
  });

  describe('getAttention', () => {
    const NOW = new Date('2026-11-10T12:00:00Z');
    const client = { user: { displayName: 'Acme Ltd' } };

    beforeEach(() => {
      invoices.find.mockResolvedValue([
        {
          id: 'inv-1',
          number: 4,
          title: 'Deposit',
          projectId: 'project-1',
          project: { name: 'Checkout redesign' },
          clientId: 'client-1',
          client,
          currency: 'USD',
          total: 1100,
          dueDate: '2026-11-07',
        },
        {
          id: 'inv-2',
          number: 5,
          title: 'Final payment',
          projectId: 'project-1',
          project: { name: 'Checkout redesign' },
          clientId: 'client-1',
          client,
          currency: 'USD',
          total: 2200,
          dueDate: '2026-11-10',
        },
      ]);
      projects.find.mockResolvedValue([
        {
          id: 'project-1',
          name: 'Checkout redesign',
          clientId: 'client-1',
          client,
          dueDate: '2026-11-15',
        },
      ]);
    });

    it('lists overdue and upcoming items with days until due', async () => {
      const attention = await service.getAttention(OWNER_ID, 7, NOW);

      expect(attention.days).toBe(7);
      expect(attention.invoices).toEqual([
        expect.objectContaining({
          id: 'inv-1',
          number: 'INV-0004',
          projectName: 'Checkout redesign',
          clientName: 'Acme Ltd',
          daysUntilDue: -3,
          isOverdue: true,
        }),
        expect.objectContaining({
          id: 'inv-2',
          daysUntilDue: 0,
          isOverdue: false,
        }),
      ]);
      expect(attention.projects).toEqual([
        {
          id: 'project-1',
          name: 'Checkout redesign',
          clientId: 'client-1',
          clientName: 'Acme Ltd',
          dueDate: '2026-11-15',
          daysUntilDue: 5,
          isOverdue: false,
        },
      ]);
    });

    it('only looks at your sent invoices and active projects in the window', async () => {
      await service.getAttention(OWNER_ID, 7, NOW);

      expect(invoices.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ownerId: OWNER_ID,
            status: InvoiceStatus.Sent,
            dueDate: LessThanOrEqual('2026-11-17'),
          },
        }),
      );
      expect(projects.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            ownerId: OWNER_ID,
            status: ProjectStatus.Active,
            dueDate: LessThanOrEqual('2026-11-17'),
          },
        }),
      );
    });

    it('defaults to a 7 day window', async () => {
      const attention = await service.getAttention(OWNER_ID, undefined, NOW);
      expect(attention.days).toBe(7);
    });
  });
});
