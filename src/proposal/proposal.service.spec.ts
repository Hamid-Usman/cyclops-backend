import { Client } from '../client/client.entity';
import { ProposalMilestone } from './proposal-milestone.entity';
import { DashboardCache } from '../cache/dashboard-cache.service';
import { passThroughDashboardCache } from '../cache/dashboard-cache.mock-spec';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Project, ProjectStatus } from '../project/project.entity';
import { DurationUnit, Proposal, ProposalStatus } from './proposal.entity';
import { hashTerms } from './proposal.rules';
import { ProposalService } from './proposal.service';

const OWNER_ID = 'owner-id';
const PROPOSAL_ID = 'proposal-id';

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: PROPOSAL_ID,
    ownerId: OWNER_ID,
    clientId: 'client-id',
    projectId: 'project-id',
    title: 'Checkout redesign proposal',
    status: ProposalStatus.Draft,
    problemStatement: 'Checkout is slow.',
    deliverables: 'A new checkout flow.',
    estimatedStartDate: null,
    estimatedDuration: 6,
    durationUnit: DurationUnit.Weeks,
    price: 5000,
    currency: 'USD',
    discount: 0,
    taxRate: 0,
    depositPercent: 0,
    subtotal: null,
    taxAmount: null,
    total: null,
    deposit: null,
    terms: 'Pay on delivery.',
    termsHash: null,
    validUntil: null,
    sentAt: null,
    viewedAt: null,
    respondedAt: null,
    acceptedByName: null,
    acceptedIp: null,
    acceptedUserAgent: null,
    termsAcceptedAt: null,
    declineReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Proposal;
}

describe('ProposalService', () => {
  let service: ProposalService;
  let proposal: Proposal;
  let project: Project | null;

  const proposals = { findOne: jest.fn(), find: jest.fn() };
  const manager = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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
        ProposalService,
        { provide: getRepositoryToken(Proposal), useValue: proposals },
        { provide: DataSource, useValue: dataSource },
        {
          provide: DashboardCache,
          useValue: passThroughDashboardCache(),
        },
      ],
    }).compile();
    service = module.get(ProposalService);

    proposal = makeProposal();
    project = {
      id: 'project-id',
      clientId: 'client-id',
      status: ProjectStatus.Inactive,
    } as Project;

    manager.findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(entity === Proposal ? proposal : project),
    );
    proposals.findOne.mockImplementation(() => Promise.resolve(proposal));
  });

  describe('create', () => {
    it('starts a draft for the project and its client', async () => {
      await service.create(OWNER_ID, {
        projectId: 'project-id',
        title: '  New proposal ',
      });

      expect(manager.insert).toHaveBeenCalledWith(
        Proposal,
        expect.objectContaining({
          ownerId: OWNER_ID,
          projectId: 'project-id',
          clientId: 'client-id',
          title: 'New proposal',
          status: ProposalStatus.Draft,
        }),
      );
    });

    it('refuses projects that are not inactive', async () => {
      project = { ...project!, status: ProjectStatus.Active };

      await expect(
        service.create(OWNER_ID, { projectId: 'project-id', title: 'New' }),
      ).rejects.toThrow('Proposals can only be made for inactive projects');
      expect(manager.insert).not.toHaveBeenCalled();
    });

    it('can be made for a client with no project yet, with a payment schedule', async () => {
      manager.findOne.mockImplementation((entity: unknown) =>
        Promise.resolve(
          entity === Client
            ? { id: 'client-id', userId: 'someone-else' }
            : null,
        ),
      );

      await service.create(OWNER_ID, {
        clientId: 'client-id',
        title: 'Website',
        depositPercent: 20,
        milestones: [
          { title: ' Design ', percent: 30 },
          { title: 'Build', percent: 50, dueDate: '2026-12-20' },
        ],
      });

      expect(manager.insert).toHaveBeenCalledWith(
        Proposal,
        expect.objectContaining({ clientId: 'client-id', projectId: null }),
      );
      expect(manager.insert).toHaveBeenCalledWith(ProposalMilestone, [
        expect.objectContaining({ position: 0, title: 'Design', percent: 30 }),
        expect.objectContaining({
          position: 1,
          title: 'Build',
          percent: 50,
          dueDate: '2026-12-20',
        }),
      ]);
    });

    it('refuses to send a proposal to yourself', async () => {
      manager.findOne.mockResolvedValue({ id: 'client-id', userId: OWNER_ID });
      await expect(
        service.create(OWNER_ID, { clientId: 'client-id', title: 'Me' }),
      ).rejects.toThrow('You cannot send a proposal to yourself');
    });
  });

  describe('update', () => {
    it('saves only the fields that were sent', async () => {
      await service.update(OWNER_ID, PROPOSAL_ID, {
        problemStatement: '  Slow checkout. ',
        terms: null,
      });

      expect(manager.update).toHaveBeenCalledWith(
        Proposal,
        { id: PROPOSAL_ID },
        { problemStatement: 'Slow checkout.', terms: null },
      );
    });

    it('refuses to edit a sent proposal', async () => {
      proposal = makeProposal({ status: ProposalStatus.Sent });

      await expect(
        service.update(OWNER_ID, PROPOSAL_ID, { title: 'Changed' }),
      ).rejects.toThrow('Only draft proposals can be changed');
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('locks in the totals and terms', async () => {
      await service.send(OWNER_ID, PROPOSAL_ID);

      expect(manager.update).toHaveBeenCalledWith(
        Proposal,
        { id: PROPOSAL_ID },
        expect.objectContaining({
          status: ProposalStatus.Sent,
          sentAt: expect.any(Date),
          termsHash: hashTerms('Pay on delivery.'),
          subtotal: 5000,
          total: 5000,
        }),
      );
    });

    it('lists the missing sections', async () => {
      proposal = makeProposal({ problemStatement: null, price: null });

      const error = await service
        .send(OWNER_ID, PROPOSAL_ID)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(
        expect.objectContaining({
          missingSections: ['problemStatement', 'cost'],
        }),
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('refuses a payment schedule that does not add up to 100%', async () => {
      manager.find.mockResolvedValueOnce([{ percent: 40 }]);
      proposal = makeProposal({ depositPercent: 20 });

      await expect(service.send(OWNER_ID, PROPOSAL_ID)).rejects.toThrow(
        'The deposit and milestones must add up to 100% (they add up to 60%)',
      );
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('sends a proposal that has no project yet', async () => {
      proposal = makeProposal({ projectId: null });
      await service.send(OWNER_ID, PROPOSAL_ID);
      expect(manager.update).toHaveBeenCalledWith(
        Proposal,
        { id: PROPOSAL_ID },
        expect.objectContaining({ status: ProposalStatus.Sent }),
      );
    });

    it('refuses when the project was cancelled', async () => {
      project = { ...project!, status: ProjectStatus.Cancelled };

      await expect(service.send(OWNER_ID, PROPOSAL_ID)).rejects.toThrow(
        'Proposals can only be sent for inactive projects',
      );
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('withdraws a sent proposal', async () => {
      proposal = makeProposal({ status: ProposalStatus.Sent });

      await service.withdraw(OWNER_ID, PROPOSAL_ID);

      expect(manager.update).toHaveBeenCalledWith(
        Proposal,
        { id: PROPOSAL_ID },
        { status: ProposalStatus.Withdrawn },
      );
    });

    it('refuses to withdraw an accepted proposal', async () => {
      proposal = makeProposal({ status: ProposalStatus.Accepted });

      await expect(service.withdraw(OWNER_ID, PROPOSAL_ID)).rejects.toThrow(
        'A proposal cannot go from accepted to withdrawn',
      );
    });
  });

  it("hides other users' proposals", async () => {
    manager.findOne.mockResolvedValue(null);

    await expect(
      service.update(OWNER_ID, PROPOSAL_ID, { title: 'Changed' }),
    ).rejects.toThrow('Proposal not found');
    expect(manager.findOne).toHaveBeenCalledWith(
      Proposal,
      expect.objectContaining({
        where: { id: PROPOSAL_ID, ownerId: OWNER_ID },
      }),
    );
  });
});
