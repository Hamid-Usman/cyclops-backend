import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import { Project, ProjectStatus } from '../project/project.entity';
import {
  CreateInvoiceDto,
  ListInvoicesQueryDto,
  MarkInvoicePaidDto,
  UpdateInvoiceDto,
} from './invoice.dto';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { InvoiceResponseDto, toInvoiceResponse } from './invoice.responses';
import {
  assertInvoiceTransition,
  calculateInvoiceTotals,
  prepareInvoiceForSend,
  toDateOnly,
} from './invoice.rules';

// Invoices are for agreed work only.
const BILLABLE_STATUSES = [ProjectStatus.Active, ProjectStatus.Completed];

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
  if (input.amount !== undefined) fields.amount = input.amount;
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
      await manager.insert(Invoice, {
        id,
        ownerId,
        clientId: project.clientId,
        projectId: project.id,
        number: null,
        status: InvoiceStatus.Draft,
        currency: 'USD',
        ...toInvoiceFields(input),
        taxRate,
        ...calculateInvoiceTotals({ amount: input.amount, taxRate }),
      });
    });

    return this.findOne(ownerId, id);
  }

  async findAll(
    ownerId: string,
    query: ListInvoicesQueryDto,
  ): Promise<InvoiceResponseDto[]> {
    const overdueOnly = query.overdue === 'true';
    const invoices = await this.invoices.find({
      where: {
        ownerId,
        ...(query.projectId !== undefined && { projectId: query.projectId }),
        ...(query.clientId !== undefined && { clientId: query.clientId }),
        ...(query.status !== undefined && { status: query.status }),
        ...(overdueOnly && {
          status: InvoiceStatus.Sent,
          dueDate: LessThan(toDateOnly(new Date())),
        }),
      },
      order: { createdAt: 'DESC' },
    });
    const now = new Date();
    return invoices.map((invoice) => toInvoiceResponse(invoice, now));
  }

  async findOne(ownerId: string, id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.invoices.findOne({ where: { id, ownerId } });
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
    return this.findOne(ownerId, id);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockDraft(manager, ownerId, id);
      await manager.delete(Invoice, { id });
    });
  }

  async send(ownerId: string, id: string): Promise<InvoiceResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const invoice = await this.lockOwned(manager, ownerId, id);
      const changes = prepareInvoiceForSend(invoice, new Date());
      await this.lockBillableProject(manager, ownerId, invoice.projectId);

      // FOR UPDATE makes two sends by the same owner wait for each other, so
      // they can't take the same number. The unique index is a backstop.
      const [{ max }] = (await manager.query(
        'SELECT MAX(`number`) AS `max` FROM `invoices` WHERE `owner_id` = ? FOR UPDATE',
        [ownerId],
      )) as [{ max: number | null }];

      await manager.update(
        Invoice,
        { id },
        { ...changes, number: Number(max ?? 0) + 1 },
      );
    });

    // TODO: email the invoice to the client.
    return this.findOne(ownerId, id);
  }

  async markPaid(
    ownerId: string,
    id: string,
    input: MarkInvoicePaidDto,
  ): Promise<InvoiceResponseDto> {
    await this.dataSource.transaction(async (manager) => {
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
    });
    return this.findOne(ownerId, id);
  }

  async void(ownerId: string, id: string): Promise<InvoiceResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const invoice = await this.lockOwned(manager, ownerId, id);
      assertInvoiceTransition(invoice.status, InvoiceStatus.Void);
      await manager.update(
        Invoice,
        { id },
        { status: InvoiceStatus.Void, voidedAt: new Date() },
      );
    });
    return this.findOne(ownerId, id);
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
