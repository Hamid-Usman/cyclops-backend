import { DashboardCache } from '../cache/dashboard-cache.service';
import { passThroughDashboardCache } from '../cache/dashboard-cache.mock-spec';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, DataSource } from 'typeorm';
import { Client } from '../client/client.entity';
import { Project, ProjectStatus } from '../project/project.entity';
import { ClientProposalService } from './client-proposal.service';
import { DurationUnit, Proposal, ProposalStatus } from './proposal.entity';
import { Invoice, InvoiceStatus } from '../invoice/invoice.entity';
import {
  MilestoneKind,
  ProjectMilestone,
} from '../project/project-milestone.entity';
import { hashTerms } from './proposal.rules';

const USER_ID = 'client-user-id';
const CLIENT_ID = 'client-id';
const PROPOSAL_ID = 'proposal-id';
const TERMS = '50% upfront, rest on delivery.';
const CONTEXT = { ip: '203.0.113.7', userAgent: 'jest' };

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: PROPOSAL_ID,
    ownerId: 'owner-id',
    clientId: CLIENT_ID,
    projectId: 'project-id',
    title: 'Checkout redesign proposal',
    status: ProposalStatus.Sent,
    price: 5000,
    currency: 'USD',
    discount: 0,
    taxRate: 0,
    depositPercent: 0,
    subtotal: 5000,
    taxAmount: 0,
    total: 5000,
    deposit: 0,
    terms: TERMS,
    termsHash: hashTerms(TERMS),
    validUntil: null,
    sentAt: new Date(),
    viewedAt: null,
    ...overrides,
  } as Proposal;
}

describe('ClientProposalService', () => {
  let service: ClientProposalService;
  let proposal: Proposal;
  let project: Project | null;

  const proposals = { findOne: jest.fn(), find: jest.fn() };
  const clients = { find: jest.fn() };
  const dashboardCache = passThroughDashboardCache();
  const manager = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    insert: jest.fn(),
    query: jest.fn().mockResolvedValue([{ max: 4 }]),
  };
  const dataSource = {
    manager,
    transaction: jest.fn((work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ClientProposalService,
        { provide: getRepositoryToken(Proposal), useValue: proposals },
        { provide: getRepositoryToken(Client), useValue: clients },
        { provide: DataSource, useValue: dataSource },
        { provide: DashboardCache, useValue: dashboardCache },
      ],
    }).compile();
    service = module.get(ClientProposalService);

    proposal = makeProposal();
    project = {
      id: 'project-id',
      status: ProjectStatus.Inactive,
    } as Project;
    clients.find.mockResolvedValue([{ id: CLIENT_ID }]);
    manager.findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(entity === Proposal ? proposal : project),
    );
    proposals.findOne.mockImplementation(() => Promise.resolve(proposal));
    proposals.find.mockResolvedValue([proposal]);
  });

  it('refuses users who are not clients', async () => {
    clients.find.mockResolvedValue([]);
    await expect(service.findAll(USER_ID)).rejects.toThrow(
      'You are not a client',
    );
  });

  it('lists only proposals sent to this client, expiring stale ones first', async () => {
    await expect(service.findAll(USER_ID)).resolves.toHaveLength(1);
    expect(clients.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      Proposal,
      expect.objectContaining({ clientId: In([CLIENT_ID]) }),
      { status: ProposalStatus.Expired },
    );
    expect(dashboardCache.invalidateClient).toHaveBeenCalledWith(CLIENT_ID);
    expect(proposals.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: In([CLIENT_ID]) }),
      }),
    );
  });

  it('includes proposals from every owner who added this person', async () => {
    clients.find.mockResolvedValue([
      { id: CLIENT_ID },
      { id: 'other-owner-client' },
    ]);
    await service.findAll(USER_ID);
    expect(proposals.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: In([CLIENT_ID, 'other-owner-client']),
        }),
      }),
    );
  });

  it('marks a sent proposal as viewed when opened', async () => {
    await service.findOne(USER_ID, PROPOSAL_ID);
    expect(manager.update).toHaveBeenCalledWith(
      Proposal,
      { id: PROPOSAL_ID },
      { status: ProposalStatus.Viewed, viewedAt: expect.any(Date) },
    );
    expect(dashboardCache.invalidateClient).toHaveBeenCalledWith(CLIENT_ID);
  });

  it('does not mark an answered proposal as viewed', async () => {
    proposal = makeProposal({ status: ProposalStatus.Declined });
    await service.findOne(USER_ID, PROPOSAL_ID);
    expect(manager.update).not.toHaveBeenCalled();
  });

  describe('accept', () => {
    it('accepts, activates the project and supersedes other proposals', async () => {
      await service.accept(
        USER_ID,
        PROPOSAL_ID,
        { agreeToTerms: true, signatureName: '  Jane Client ' },
        CONTEXT,
      );

      expect(manager.update).toHaveBeenCalledWith(
        Proposal,
        expect.objectContaining({ projectId: 'project-id' }),
        { status: ProposalStatus.Superseded },
      );
      expect(manager.update).toHaveBeenCalledWith(
        Proposal,
        { id: PROPOSAL_ID },
        expect.objectContaining({
          status: ProposalStatus.Accepted,
          acceptedByName: 'Jane Client',
          acceptedIp: '203.0.113.7',
          acceptedUserAgent: 'jest',
          acceptedProjectId: 'project-id',
          termsAcceptedAt: expect.any(Date),
        }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        Project,
        { id: 'project-id' },
        expect.objectContaining({
          status: ProjectStatus.Active,
          activatedAt: expect.any(Date),
        }),
      );
      expect(dashboardCache.invalidate).toHaveBeenCalledWith('owner-id');
    });

    it('creates the project and its payment schedule when there is none', async () => {
      proposal = makeProposal({
        projectId: null,
        title: 'Website build',
        problemStatement: 'Slow site',
        deliverables: 'New site',
        estimatedStartDate: '2026-12-01',
        estimatedDuration: 2,
        durationUnit: DurationUnit.Weeks,
        depositPercent: 20,
        total: 1000,
      });
      manager.find.mockResolvedValueOnce([
        {
          title: 'Design',
          deliverables: 'Mockups',
          percent: 30,
          dueDate: null,
        },
        {
          title: 'Build',
          deliverables: null,
          percent: 50,
          dueDate: '2026-12-20',
        },
      ]);

      await service.accept(
        USER_ID,
        PROPOSAL_ID,
        { agreeToTerms: true, signatureName: 'Jane' },
        CONTEXT,
      );

      const [, created] = manager.insert.mock.calls.find(
        ([entity]) => entity === Project,
      )!;
      expect(created).toEqual(
        expect.objectContaining({
          ownerId: 'owner-id',
          clientId: CLIENT_ID,
          name: 'Website build',
          description: 'Slow site',
          deliverables: 'New site',
          status: ProjectStatus.Active,
          startDate: '2026-12-01',
          // The latest milestone due date wins over the estimate.
          dueDate: '2026-12-20',
        }),
      );
      expect(manager.update).toHaveBeenCalledWith(
        Proposal,
        { id: PROPOSAL_ID },
        expect.objectContaining({
          status: ProposalStatus.Accepted,
          projectId: created.id,
          acceptedProjectId: created.id,
        }),
      );
      // No other proposals to supersede without an existing project.
      expect(manager.update).not.toHaveBeenCalledWith(
        Proposal,
        expect.objectContaining({ projectId: expect.anything() }),
        { status: ProposalStatus.Superseded },
      );

      const [, schedule] = manager.insert.mock.calls.find(
        ([entity]) => entity === ProjectMilestone,
      )!;
      expect(
        schedule.map((step: ProjectMilestone) => [
          step.kind,
          step.title,
          step.percent,
          step.amount,
        ]),
      ).toEqual([
        [MilestoneKind.Deposit, 'Deposit', 20, 200],
        [MilestoneKind.Milestone, 'Design', 30, 300],
        [MilestoneKind.Milestone, 'Build', 50, 500],
      ]);

      // Every step is invoiced right away; the deposit is sent.
      const invoices = manager.insert.mock.calls
        .filter(([entity]) => entity === Invoice)
        .map(([, invoice]) => invoice as Invoice);
      expect(
        invoices.map((invoice) => [invoice.title, invoice.status]),
      ).toEqual([
        ['Deposit - Website build', InvoiceStatus.Draft],
        ['Design - Website build', InvoiceStatus.Draft],
        ['Build - Website build', InvoiceStatus.Draft],
      ]);
      expect(manager.update).toHaveBeenCalledWith(
        Invoice,
        { id: invoices[0].id },
        expect.objectContaining({
          status: InvoiceStatus.Sent,
          number: 5,
          issueDate: expect.any(String),
          dueDate: expect.any(String),
        }),
      );
      expect(manager.update).not.toHaveBeenCalledWith(
        Invoice,
        { id: invoices[1].id },
        expect.anything(),
      );
      for (const [index, step] of schedule.entries()) {
        expect(manager.update).toHaveBeenCalledWith(
          ProjectMilestone,
          { id: step.id },
          { invoiceId: invoices[index].id },
        );
      }
    });

    it('does not duplicate a schedule the project already has', async () => {
      manager.count.mockResolvedValueOnce(3);
      await service.accept(
        USER_ID,
        PROPOSAL_ID,
        { agreeToTerms: true, signatureName: 'Jane' },
        CONTEXT,
      );
      expect(manager.insert).not.toHaveBeenCalledWith(
        ProjectMilestone,
        expect.anything(),
      );
    });

    it('requires agreeing to the terms', async () => {
      await expect(
        service.accept(
          USER_ID,
          PROPOSAL_ID,
          { agreeToTerms: false, signatureName: 'Jane' },
          CONTEXT,
        ),
      ).rejects.toThrow('You must agree to the terms to accept');
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('refuses when the project is no longer inactive', async () => {
      project = {
        id: 'project-id',
        status: ProjectStatus.Cancelled,
      } as Project;
      await expect(
        service.accept(
          USER_ID,
          PROPOSAL_ID,
          { agreeToTerms: true, signatureName: 'Jane' },
          CONTEXT,
        ),
      ).rejects.toThrow('A project cannot go from cancelled to active');
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('marks an expired proposal as expired and refuses it', async () => {
      proposal = makeProposal({ validUntil: new Date('2020-01-01') });
      await expect(
        service.accept(
          USER_ID,
          PROPOSAL_ID,
          { agreeToTerms: true, signatureName: 'Jane' },
          CONTEXT,
        ),
      ).rejects.toThrow('This proposal has expired');
      expect(manager.update).toHaveBeenCalledWith(
        Proposal,
        { id: PROPOSAL_ID },
        { status: ProposalStatus.Expired },
      );
    });
  });

  describe('decline', () => {
    it('records the reason', async () => {
      await service.decline(USER_ID, PROPOSAL_ID, { reason: ' Too pricey ' });
      expect(manager.update).toHaveBeenCalledWith(
        Proposal,
        { id: PROPOSAL_ID },
        {
          status: ProposalStatus.Declined,
          respondedAt: expect.any(Date),
          declineReason: 'Too pricey',
        },
      );
    });

    it('refuses an accepted proposal', async () => {
      proposal = makeProposal({ status: ProposalStatus.Accepted });
      await expect(service.decline(USER_ID, PROPOSAL_ID, {})).rejects.toThrow(
        'A proposal cannot go from accepted to declined',
      );
    });
  });
});
