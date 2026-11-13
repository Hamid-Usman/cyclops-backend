import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { DashboardCache } from '../cache/dashboard-cache.service';
import { CurrencyTotalDto } from '../dashboard/dashboard.responses';
import {
  InvoiceResponseDto,
  ReportPaymentDto,
  toInvoiceResponse,
} from '../invoice/invoice.dto';
import { Invoice, InvoiceStatus } from '../invoice/invoice.entity';
import { toDateOnly } from '../invoice/invoice.rules';
import { Project, ProjectStatus } from '../project/project.entity';
import { ProjectMilestone } from '../project/project-milestone.entity';
import {
  toMilestoneResponse,
  toProjectResponse,
} from '../project/project.responses';
import { Proposal, ProposalStatus } from '../proposal/proposal.entity';
import { toProposalSummary } from '../proposal/proposal.responses';
import { Client } from './client.entity';
import { ClientOverviewResponseDto } from './client.responses';

// The overview is cached per client for this long. Writes that change what a
// client sees clear it (see DashboardCache.invalidateClient).
const OVERVIEW_CACHE_TTL_MS = 30_000;

// Which client records a person has changes only when an owner adds,
// changes or removes them (ClientService clears it then).
const CLIENT_RECORDS_CACHE_TTL_MS = 10 * 60_000;

// What the portal needs of a client record. Kept small and plain so it
// survives a round trip through Redis as JSON.
interface ClientRecord {
  id: string;
  status: Client['status'];
  user: { id: string; email: string; displayName: string };
}

function totalsByCurrency(invoices: InvoiceResponseDto[]): CurrencyTotalDto[] {
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    // Sum in cents so float errors don't add up.
    const cents = Math.round(invoice.total * 100);
    totals.set(invoice.currency, (totals.get(invoice.currency) ?? 0) + cents);
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, cents]) => ({ currency, amount: cents / 100 }));
}

/**
 * The client's own view: everything the people they work with have shared
 * with them. Drafts (proposals and invoices) stay private to the owner.
 */
@Injectable()
export class ClientPortalService {
  constructor(
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(Proposal)
    private readonly proposals: Repository<Proposal>,
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    @InjectRepository(ProjectMilestone)
    private readonly milestones: Repository<ProjectMilestone>,
    private readonly dataSource: DataSource,
    private readonly dashboardCache: DashboardCache,
  ) {}

  /**
   * The client tells the owner they paid a sent invoice, optionally with a
   * reference. The invoice stays "sent" until the owner marks it paid.
   */
  async reportPayment(
    userId: string,
    invoiceId: string,
    input: ReportPaymentDto,
  ): Promise<InvoiceResponseDto> {
    const clients = await this.findClients(userId);
    const invoice = await this.dataSource.transaction(async (manager) => {
      const invoice = await manager.findOne(Invoice, {
        where: {
          id: invoiceId,
          clientId: In(clients.map((client) => client.id)),
          status: Not(InvoiceStatus.Draft),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
      if (invoice.status !== InvoiceStatus.Sent) {
        throw new ConflictException(
          `This invoice is ${invoice.status}, so there is nothing to pay`,
        );
      }
      await manager.update(
        Invoice,
        { id: invoiceId },
        {
          paymentReportedAt: new Date(),
          paymentReference: input.reference?.trim() || null,
        },
      );
      return invoice;
    });
    await this.dashboardCache.invalidate(invoice.ownerId);
    await this.dashboardCache.invalidateClient(invoice.clientId);

    const updated = await this.invoices.findOne({
      where: { id: invoiceId },
      relations: { lineItems: true },
      order: { lineItems: { position: 'ASC' } },
    });
    return toInvoiceResponse(updated!);
  }

  /** The person's client records, one per owner, most recent first. */
  private async findClients(userId: string): Promise<ClientRecord[]> {
    const clients = await this.dashboardCache.wrapForUser(
      userId,
      'client-records',
      async (): Promise<ClientRecord[]> => {
        const found = await this.clients.find({
          where: { userId },
          relations: { user: true },
          order: { createdAt: 'DESC' },
        });
        return found.map((client) => ({
          id: client.id,
          status: client.status,
          user: {
            id: client.user.id,
            email: client.user.email,
            displayName: client.user.displayName,
          },
        }));
      },
      CLIENT_RECORDS_CACHE_TTL_MS,
    );
    if (clients.length === 0) {
      throw new NotFoundException('You are not a client');
    }
    return clients;
  }

  async getOverview(
    userId: string,
    now = new Date(),
  ): Promise<ClientOverviewResponseDto> {
    const clients = await this.findClients(userId);
    // Keyed by day because isOverdue depends on today's date.
    return this.dashboardCache.wrapForClients(
      clients.map((client) => client.id),
      `overview:${toDateOnly(now)}`,
      () => this.loadOverview(clients, now),
      OVERVIEW_CACHE_TTL_MS,
    );
  }

  private async loadOverview(
    clients: ClientRecord[],
    now: Date,
  ): Promise<ClientOverviewResponseDto> {
    // The overview's `client` is the most recent record; the lists cover all.
    const [client] = clients;
    const clientId = In(clients.map((record) => record.id));
    // Milestones are found through their project's client, so all four
    // queries run at once instead of milestones waiting for projects.
    const [projects, proposals, invoices, milestones] = await Promise.all([
      this.projects.find({
        where: { clientId },
        order: { createdAt: 'DESC' },
      }),
      this.proposals.find({
        where: { clientId, status: Not(ProposalStatus.Draft) },
        order: { sentAt: 'DESC' },
      }),
      this.invoices.find({
        where: { clientId, status: Not(InvoiceStatus.Draft) },
        relations: { lineItems: true },
        order: { issueDate: 'DESC', lineItems: { position: 'ASC' } },
      }),
      this.milestones.find({
        where: { project: { clientId } },
        relations: { invoice: true },
        order: { projectId: 'ASC', position: 'ASC' },
      }),
    ]);

    const invoiceResponses = invoices.map((invoice) =>
      toInvoiceResponse(invoice, now),
    );
    const unpaid = invoiceResponses.filter(
      (invoice) => invoice.status === InvoiceStatus.Sent,
    );

    return {
      client: {
        id: client.id,
        status: client.status,
        user: {
          id: client.user.id,
          email: client.user.email,
          displayName: client.user.displayName,
        },
      },
      summary: {
        activeProjects: projects.filter(
          (project) => project.status === ProjectStatus.Active,
        ).length,
        proposalsAwaitingResponse: proposals.filter(
          (proposal) =>
            proposal.status === ProposalStatus.Sent ||
            proposal.status === ProposalStatus.Viewed,
        ).length,
        unpaidInvoices: unpaid.length,
        overdueInvoices: unpaid.filter((invoice) => invoice.isOverdue).length,
        amountDue: totalsByCurrency(unpaid),
      },
      projects: projects.map(toProjectResponse),
      proposals: proposals.map(toProposalSummary),
      invoices: invoiceResponses,
      milestones: milestones.map((milestone) =>
        toMilestoneResponse(milestone, { hideDrafts: true }),
      ),
    };
  }
}
