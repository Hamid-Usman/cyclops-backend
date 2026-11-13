import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { toPage } from '../common/pagination';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import { DashboardCache } from '../cache/dashboard-cache.service';
import { LIST_CACHE_TTL_MS, listCacheKey } from '../cache/list-cache-key';
import { ProjectMilestone } from '../project/project-milestone.entity';
import { Project, ProjectStatus } from '../project/project.entity';
import { Proposal, ProposalStatus } from '../proposal/proposal.entity';
import {
  CreateInvoiceDto,
  CreateInvoiceFromMilestoneDto,
  InvoiceResponseDto,
  ListInvoicesQueryDto,
  MarkInvoicePaidDto,
  toInvoiceResponse,
  UpdateInvoiceDto,
} from './invoice.dto';
import { Invoice, InvoiceLineItem, InvoiceStatus } from './invoice.entity';
import {
  assertInvoiceTransition,
  calculateInvoiceTotals,
  calculateLineItems,
  formatInvoiceNumber,
  LineItemInput,
  prepareInvoiceForSend,
  toDateOnly,
} from './invoice.rules';
import {
  draftMilestoneInvoice,
  nextInvoiceNumber,
} from './milestone-invoicing';

// Invoices are for agreed work only.
const BILLABLE_STATUSES = [ProjectStatus.Active, ProjectStatus.Completed];

// Loads the lines with each invoice, in their order on the invoice.
const WITH_LINE_ITEMS = {
  relations: { lineItems: true },
  order: { lineItems: { position: 'ASC' } },
} as const;

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toInvoiceFields(
  input: CreateInvoiceDto | UpdateInvoiceDto,
): Partial<Invoice> {
  const fields: Partial<Invoice> = {};
  if (input.title !== undefined) fields.title = input.title.trim();
  if (input.description !== undefined)
    fields.description = trimOrNull(input.description);
  if (input.notes !== undefined) fields.notes = trimOrNull(input.notes);
  if (input.currency !== undefined) fields.currency = input.currency;
  if (input.taxRate !== undefined) fields.taxRate = input.taxRate;
  if (input.dueDate !== undefined) fields.dueDate = input.dueDate;
  return fields;
}

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    private readonly dataSource: DataSource,
    private readonly dashboardCache: DashboardCache,
  ) {}

  async create(
    ownerId: string,
    input: CreateInvoiceDto,
  ): Promise<InvoiceResponseDto> {
    const id = randomUUID();

    await this.dataSource.transaction(async (manager) => {
      const project = await this.lockBillableProject(
        manager,
        ownerId,
        input.projectId,
      );
      const taxRate = input.taxRate ?? 0;
      const { lines, amount } = calculateLineItems(input.lineItems);
      await manager.insert(Invoice, {
        id,
        ownerId,
        clientId: project.clientId,
        projectId: project.id,
        number: null,
        status: InvoiceStatus.Draft,
        currency: 'USD',
        ...toInvoiceFields(input),
        amount,
        taxRate,
        ...calculateInvoiceTotals({ amount, taxRate }),
      });
      await this.insertLineItems(manager, id, lines);
    });
    await this.dashboardCache.invalidate(ownerId);

    return this.findOne(ownerId, id);
  }

  async findAll(
    ownerId: string,
    query: ListInvoicesQueryDto,
  ): Promise<InvoiceResponseDto[]> {
    const overdueOnly = query.overdue === 'true';
    // Keyed by day because "overdue" depends on today's date.
    const today = toDateOnly(new Date());
    return this.dashboardCache.wrap(
      ownerId,
      listCacheKey(`invoices:${today}`, query),
      async () => {
        const invoices = await this.invoices.find({
          ...WITH_LINE_ITEMS,
          ...toPage(query),
          where: {
            ownerId,
            ...(query.projectId !== undefined && {
              projectId: query.projectId,
            }),
            ...(query.clientId !== undefined && { clientId: query.clientId }),
            ...(query.status !== undefined && { status: query.status }),
            ...(overdueOnly && {
              status: InvoiceStatus.Sent,
              dueDate: LessThan(today),
            }),
          },
          order: { createdAt: 'DESC', id: 'ASC', ...WITH_LINE_ITEMS.order },
        });
        const now = new Date();
        return invoices.map((invoice) => toInvoiceResponse(invoice, now));
      },
      LIST_CACHE_TTL_MS,
    );
  }

  async findOne(ownerId: string, id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoices.findOne({
      ...WITH_LINE_ITEMS,
      where: { id, ownerId },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return toInvoiceResponse(invoice);
  }

  async update(
    ownerId: string,
    id: string,
    input: UpdateInvoiceDto,
  ): Promise<InvoiceResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const invoice = await this.lockDraft(manager, ownerId, id);
      const fields = toInvoiceFields(input);
      if (input.lineItems !== undefined) {
        const { lines, amount } = calculateLineItems(input.lineItems);
        await manager.delete(InvoiceLineItem, { invoiceId: id });
        await this.insertLineItems(manager, id, lines);
        fields.amount = amount;
      }
      if (Object.keys(fields).length === 0) {
        return;
      }
      if (fields.amount !== undefined || fields.taxRate !== undefined) {
        Object.assign(
          fields,
          calculateInvoiceTotals({
            amount: fields.amount ?? invoice.amount,
            taxRate: fields.taxRate ?? invoice.taxRate,
          }),
        );
      }
      await manager.update(Invoice, { id }, fields);
    });
    await this.dashboardCache.invalidate(ownerId);
    return this.findOne(ownerId, id);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockDraft(manager, ownerId, id);
      await manager.delete(Invoice, { id });
    });
    await this.dashboardCache.invalidate(ownerId);
  }

  async send(ownerId: string, id: string): Promise<InvoiceResponseDto> {
    const clientId = await this.dataSource.transaction(async (manager) => {
      const invoice = await this.lockOwned(manager, ownerId, id);
      const changes = prepareInvoiceForSend(invoice, new Date());
      await this.lockBillableProject(manager, ownerId, invoice.projectId);

      await manager.update(
        Invoice,
        { id },
        { ...changes, number: await nextInvoiceNumber(manager, ownerId) },
      );
      return invoice.clientId;
    });
    await this.dashboardCache.invalidate(ownerId);
    await this.dashboardCache.invalidateClient(clientId);

    // TODO: email the invoice to the client.
    return this.findOne(ownerId, id);
  }

  async markPaid(
    ownerId: string,
    id: string,
    input: MarkInvoicePaidDto,
  ): Promise<InvoiceResponseDto> {
    const clientId = await this.dataSource.transaction(async (manager) => {
      const invoice = await this.lockOwned(manager, ownerId, id);
      assertInvoiceTransition(invoice.status, InvoiceStatus.Paid);

      const now = new Date();
      const paidAt = input.paidAt ?? now;
      if (paidAt > now) {
        throw new BadRequestException(
          'The payment date cannot be in the future',
        );
      }
      await manager.update(
        Invoice,
        { id },
        { status: InvoiceStatus.Paid, paidAt },
      );
      return invoice.clientId;
    });
    await this.dashboardCache.invalidate(ownerId);
    await this.dashboardCache.invalidateClient(clientId);
    return this.findOne(ownerId, id);
  }

  async void(ownerId: string, id: string): Promise<InvoiceResponseDto> {
    const clientId = await this.dataSource.transaction(async (manager) => {
      const invoice = await this.lockOwned(manager, ownerId, id);
      assertInvoiceTransition(invoice.status, InvoiceStatus.Void);
      await manager.update(
        Invoice,
        { id },
        { status: InvoiceStatus.Void, voidedAt: new Date() },
      );
      return invoice.clientId;
    });
    await this.dashboardCache.invalidate(ownerId);
    await this.dashboardCache.invalidateClient(clientId);
    return this.findOne(ownerId, id);
  }

  /**
   * Drafts the invoice for one step of a project's payment schedule, priced
   * from the accepted proposal: that share of the agreed price after
   * discount, with the agreed currency and tax rate. Each step is billed at
   * most once; voiding its invoice frees it again.
   */
  async createFromMilestone(
    ownerId: string,
    input: CreateInvoiceFromMilestoneDto,
  ): Promise<InvoiceResponseDto> {
    let id = '';

    await this.dataSource.transaction(async (manager) => {
      const found = await manager.findOne(ProjectMilestone, {
        where: { id: input.milestoneId },
      });
      if (!found) {
        throw new NotFoundException('Milestone not found');
      }
      // Lock order is project, then milestone. This also checks ownership.
      const project = await this.lockBillableProject(
        manager,
        ownerId,
        found.projectId,
      );
      const milestone = await manager.findOneOrFail(ProjectMilestone, {
        where: { id: found.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (milestone.invoiceId) {
        const existing = await manager.findOne(Invoice, {
          where: { id: milestone.invoiceId },
        });
        if (existing && existing.status !== InvoiceStatus.Void) {
          throw new ConflictException(
            `${milestone.title} is already billed on ${formatInvoiceNumber(existing.number) ?? 'a draft invoice'}`,
          );
        }
      }

      const proposal = await manager.findOne(Proposal, {
        where: {
          acceptedProjectId: project.id,
          status: ProposalStatus.Accepted,
        },
      });
      if (!proposal) {
        throw new ConflictException(
          'This project has no accepted proposal to bill from',
        );
      }

      const schedule = await manager.find(ProjectMilestone, {
        where: { projectId: project.id },
        order: { position: 'ASC' },
      });
      id = await draftMilestoneInvoice(
        manager,
        { ownerId, project, proposal, schedule },
        milestone,
      );
    });
    await this.dashboardCache.invalidate(ownerId);

    return this.findOne(ownerId, id);
  }

  private async insertLineItems(
    manager: EntityManager,
    invoiceId: string,
    lines: (LineItemInput & { position: number; amount: number })[],
  ): Promise<void> {
    await manager.insert(
      InvoiceLineItem,
      lines.map((line) => ({ id: randomUUID(), invoiceId, ...line })),
    );
  }

  private async lockBillableProject(
    manager: EntityManager,
    ownerId: string,
    projectId: string,
  ): Promise<Project> {
    const project = await manager.findOne(Project, {
      where: { id: projectId, ownerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (!BILLABLE_STATUSES.includes(project.status)) {
      throw new ConflictException(
        'Invoices are only for active or completed projects',
      );
    }
    return project;
  }

  private async lockOwned(
    manager: EntityManager,
    ownerId: string,
    id: string,
  ): Promise<Invoice> {
    const invoice = await manager.findOne(Invoice, {
      where: { id, ownerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  private async lockDraft(
    manager: EntityManager,
    ownerId: string,
    id: string,
  ): Promise<Invoice> {
    const invoice = await this.lockOwned(manager, ownerId, id);
    if (invoice.status !== InvoiceStatus.Draft) {
      throw new ConflictException(
        'Only draft invoices can be changed. Void it and create a new one instead.',
      );
    }
    return invoice;
  }
}
