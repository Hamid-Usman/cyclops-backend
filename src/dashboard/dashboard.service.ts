import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ClientStatus } from '../client/client.entity';
import { Invoice, InvoiceStatus } from '../invoice/invoice.entity';
import {
  addDays,
  formatInvoiceNumber,
  toDateOnly,
} from '../invoice/invoice.rules';
import { Project, ProjectStatus } from '../project/project.entity';
import { DEFAULT_ATTENTION_DAYS } from './dashboard.dto';
import {
  AttentionInvoiceDto,
  AttentionProjectDto,
  AttentionResponseDto,
  DashboardResponseDto,
  PendingInvoicesDto,
} from './dashboard.responses';

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days from `today` to `dueDate`, both YYYY-MM-DD. Negative when past.
function daysBetween(today: string, dueDate: string): number {
  return Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      DAY_MS,
  );
}

interface PendingRow {
  currency: string;
  count: string | number;
  overdue: string | number | null;
  total: string | number | null;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
  ) {}

  async getSummary(
    ownerId: string,
    now = new Date(),
  ): Promise<DashboardResponseDto> {
    const [activeClients, activeProjects, pendingInvoices] = await Promise.all([
      this.countActiveClients(ownerId),
      this.projects.count({
        where: { ownerId, status: ProjectStatus.Active },
      }),
      this.summarizePendingInvoices(ownerId, toDateOnly(now)),
    ]);
    return { activeClients, activeProjects, pendingInvoices };
  }

  // Sent invoices and active projects that are overdue or due within `days`.
  async getAttention(
    ownerId: string,
    days = DEFAULT_ATTENTION_DAYS,
    now = new Date(),
  ): Promise<AttentionResponseDto> {
    const today = toDateOnly(now);
    const horizon = LessThanOrEqual(addDays(today, days));

    const [invoices, projects] = await Promise.all([
      this.invoices.find({
        where: { ownerId, status: InvoiceStatus.Sent, dueDate: horizon },
        relations: { project: true, client: { user: true } },
        order: { dueDate: 'ASC', number: 'ASC' },
      }),
      this.projects.find({
        where: { ownerId, status: ProjectStatus.Active, dueDate: horizon },
        relations: { client: { user: true } },
        order: { dueDate: 'ASC', name: 'ASC' },
      }),
    ]);

    return {
      days,
      invoices: invoices.map((invoice): AttentionInvoiceDto => {
        const daysUntilDue = daysBetween(today, invoice.dueDate!);
        return {
          id: invoice.id,
          number: formatInvoiceNumber(invoice.number)!,
          title: invoice.title,
          projectId: invoice.projectId,
          projectName: invoice.project.name,
          clientId: invoice.clientId,
          clientName: invoice.client.user.displayName,
          currency: invoice.currency,
          total: invoice.total,
          dueDate: invoice.dueDate!,
          daysUntilDue,
          isOverdue: daysUntilDue < 0,
        };
      }),
      projects: projects.map((project): AttentionProjectDto => {
        const daysUntilDue = daysBetween(today, project.dueDate!);
        return {
          id: project.id,
          name: project.name,
          clientId: project.clientId,
          clientName: project.client.user.displayName,
          dueDate: project.dueDate!,
          daysUntilDue,
          isOverdue: daysUntilDue < 0,
        };
      }),
    };
  }

  // Clients aren't directly owned by a user; instead, the relationship between an owner and a client is established through projects.
  // Therefore, "your" clients are defined as clients who have at least one active project associated with the given owner.
  // This ensures that only clients with ongoing collaborations (active projects) for the owner are counted.
  private async countActiveClients(ownerId: string): Promise<number> {
    const row = await this.projects
      .createQueryBuilder('project')
      .innerJoin('project.client', 'client')
      .select('COUNT(DISTINCT project.clientId)', 'count')
      .where('project.ownerId = :ownerId', { ownerId })
      .andWhere('client.status = :status', { status: ClientStatus.Active })
      .getRawOne<{ count: string | number }>();
    return Number((row && row.count) || 0);
  }

  private async summarizePendingInvoices(
    ownerId: string,
    today: string,
  ): Promise<PendingInvoicesDto> {
    const rows = await this.invoices
      .createQueryBuilder('invoice')
      .select('invoice.currency', 'currency')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        `SUM(CASE WHEN DATE(invoice.dueDate) < DATE(:today) THEN 1 ELSE 0 END)`,
        'overdue',
      )
      .addSelect('SUM(invoice.total)', 'total')
      .where('invoice.ownerId = :ownerId', { ownerId })
      .andWhere('invoice.status = :status', { status: InvoiceStatus.Sent })
      .setParameter('today', today)
      .groupBy('invoice.currency')
      .orderBy('invoice.currency', 'ASC')
      .getRawMany<PendingRow>();

    return {
      count: rows.reduce((sum, row) => sum + Number(row.count), 0),
      overdueCount: rows.reduce(
        (sum, row) => sum + Number(row.overdue ?? 0),
        0,
      ),
      totals: rows.map((row) => ({
        currency: row.currency,
        amount: Number(row.total ?? 0),
      })),
    };
  }
}
