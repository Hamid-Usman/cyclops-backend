import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DashboardCache } from '../cache/dashboard-cache.service';
import {
  MilestoneKind,
  ProjectMilestone,
} from '../project/project-milestone.entity';
import { Project, ProjectStatus } from '../project/project.entity';
import { Proposal, ProposalStatus } from '../proposal/proposal.entity';
import { Invoice, InvoiceLineItem, InvoiceStatus } from './invoice.entity';
import { InvoiceService } from './invoice.service';

const OWNER_ID = 'owner-id';

function step(id: string, percent: number, overrides = {}): ProjectMilestone {
  return {
    id,
    projectId: 'project-id',
    position: 0,
    kind: MilestoneKind.Milestone,
    title: id,
    deliverables: null,
    percent,
    amount: 0,
    currency: 'EUR',
    dueDate: null,
    completedAt: null,
    invoiceId: null,
    ...overrides,
  } as ProjectMilestone;
}

describe('InvoiceService.createFromMilestone', () => {
  let service: InvoiceService;
  let schedule: ProjectMilestone[];
  let project: Project | null;
  let proposal: Proposal | null;
  let existingInvoice: Invoice | null;

  const invoices = { findOne: jest.fn() };
  const manager = {
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    find: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
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
          useValue: { invalidate: jest.fn(), invalidateClient: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(InvoiceService);

    schedule = [
      step('deposit', 33.33, { kind: MilestoneKind.Deposit, title: 'Deposit' }),
      step('design', 33.33, {
        title: 'Design',
        deliverables: 'Mockups',
        dueDate: '2099-01-31',
      }),
      step('build', 33.34, { title: 'Build' }),
    ];
    project = {
      id: 'project-id',
      name: 'Website',
      clientId: 'client-id',
      status: ProjectStatus.Active,
    } as Project;
    proposal = {
      price: 1100,
      discount: 100,
      taxRate: 10,
      currency: 'EUR',
      status: ProposalStatus.Accepted,
    } as Proposal;
    existingInvoice = null;

    manager.findOne.mockImplementation(
      (entity: unknown, options: { where: { id?: string } }) => {
        if (entity === ProjectMilestone)
          return Promise.resolve(
            schedule.find((s) => s.id === options.where.id) ?? null,
          );
        if (entity === Project) return Promise.resolve(project);
        if (entity === Proposal) return Promise.resolve(proposal);
        if (entity === Invoice) return Promise.resolve(existingInvoice);
        return Promise.resolve(null);
      },
    );
    manager.findOneOrFail.mockImplementation(
      (_entity: unknown, options: { where: { id: string } }) =>
        Promise.resolve(schedule.find((s) => s.id === options.where.id)),
    );
    manager.find.mockImplementation(() => Promise.resolve(schedule));
    invoices.findOne.mockResolvedValue({
      id: 'new',
      status: InvoiceStatus.Draft,
      lineItems: [],
    });
  });

  it("drafts the milestone's share of the agreed price, with the agreed tax", async () => {
    await service.createFromMilestone(OWNER_ID, { milestoneId: 'design' });

    const [, created] = manager.insert.mock.calls.find(
      ([entity]) => entity === Invoice,
    )!;
    // 33.33% of (1100 - 100) = 333.30, plus 10% tax.
    expect(created).toEqual(
      expect.objectContaining({
        ownerId: OWNER_ID,
        clientId: 'client-id',
        projectId: 'project-id',
        status: InvoiceStatus.Draft,
        title: 'Design - Website',
        description: 'Mockups',
        currency: 'EUR',
        amount: 333.3,
        taxRate: 10,
        taxAmount: 33.33,
        total: 366.63,
        dueDate: '2099-01-31',
      }),
    );
    const [, lines] = manager.insert.mock.calls.find(
      ([entity]) => entity === InvoiceLineItem,
    )!;
    expect(lines).toEqual([
      expect.objectContaining({
        description: 'Design: 33.33% of the agreed price',
        quantity: 1,
        unitPrice: 333.3,
      }),
    ]);
    expect(manager.update).toHaveBeenCalledWith(
      ProjectMilestone,
      { id: 'design' },
      { invoiceId: created.id },
    );
  });

  it('gives the last step the remainder so the parts add up to the price', async () => {
    await service.createFromMilestone(OWNER_ID, { milestoneId: 'build' });
    const [, created] = manager.insert.mock.calls.find(
      ([entity]) => entity === Invoice,
    )!;
    // 1000 - 333.30 - 333.30
    expect(created.amount).toBe(333.4);
  });

  it('refuses to bill a milestone twice', async () => {
    schedule[1].invoiceId = 'inv-1';
    existingInvoice = {
      id: 'inv-1',
      number: 7,
      status: InvoiceStatus.Sent,
    } as Invoice;
    await expect(
      service.createFromMilestone(OWNER_ID, { milestoneId: 'design' }),
    ).rejects.toThrow('Design is already billed on INV-0007');
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('bills again once the earlier invoice was voided', async () => {
    schedule[1].invoiceId = 'inv-1';
    existingInvoice = {
      id: 'inv-1',
      number: 7,
      status: InvoiceStatus.Void,
    } as Invoice;
    await service.createFromMilestone(OWNER_ID, { milestoneId: 'design' });
    expect(manager.insert).toHaveBeenCalledWith(Invoice, expect.anything());
  });

  it('needs an accepted proposal to price from', async () => {
    proposal = null;
    await expect(
      service.createFromMilestone(OWNER_ID, { milestoneId: 'design' }),
    ).rejects.toThrow('This project has no accepted proposal to bill from');
  });

  it('does not bill projects that are not active or completed', async () => {
    project = { ...project!, status: ProjectStatus.Cancelled } as Project;
    await expect(
      service.createFromMilestone(OWNER_ID, { milestoneId: 'design' }),
    ).rejects.toThrow('Invoices are only for active or completed projects');
  });
});
