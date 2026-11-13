import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  LessThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { DashboardCache } from '../cache/dashboard-cache.service';
import { Client } from '../client/client.entity';
import { randomUUID } from 'node:crypto';
import { fromHundredths, toHundredths } from '../common/money';
import {
  buildProjectSchedule,
  estimateDueDate,
  splitByPercent,
} from '../project/milestone.rules';
import { ProjectMilestone } from '../project/project-milestone.entity';
import { Project, ProjectStatus } from '../project/project.entity';
import { assertProjectTransition } from '../project/project.rules';
import { AcceptProposalDto, DeclineProposalDto } from './proposal.dto';
import { invoiceSchedule } from '../invoice/milestone-invoicing';
import { ProposalMilestone } from './proposal-milestone.entity';
import { Proposal, ProposalStatus } from './proposal.entity';
import {
  ProposalResponseDto,
  ProposalSummaryResponseDto,
  toProposalResponse,
  toProposalSummary,
} from './proposal.responses';
import { assertCanAccept, assertCanRespond, isExpired } from './proposal.rules';

// Statuses a client is still able to answer.
const OPEN_STATUSES = [ProposalStatus.Sent, ProposalStatus.Viewed];

// Who accepted, recorded with the acceptance as evidence.
export interface AcceptanceContext {
  ip: string | null;
  userAgent: string | null;
}

/**
 * The client's side of proposals: the user behind a client record sees the
 * proposals sent to them, and accepts or declines them. Accepting is the only
 * way a project becomes active.
 */
@Injectable()
export class ClientProposalService {
  constructor(
    @InjectRepository(Proposal)
    private readonly proposals: Repository<Proposal>,
    @InjectRepository(Client)
    private readonly clients: Repository<Client>,
    private readonly dataSource: DataSource,
    private readonly dashboardCache: DashboardCache,
  ) {}

  async findAll(userId: string): Promise<ProposalSummaryResponseDto[]> {
    const clientIds = await this.findClientIds(userId);
    await this.expireStale(this.dataSource.manager, clientIds);
    const proposals = await this.proposals.find({
      // Drafts are the owner's work in progress.
      where: { clientId: In(clientIds), status: Not(ProposalStatus.Draft) },
      order: { sentAt: 'DESC' },
    });
    return proposals.map(toProposalSummary);
  }

  /** Opening a sent proposal marks it as viewed. */
  async findOne(userId: string, id: string): Promise<ProposalResponseDto> {
    const clientIds = await this.findClientIds(userId);
    let clientId = '';
    const changed = await this.dataSource.transaction(async (manager) => {
      const proposal = await this.lockReceived(manager, clientIds, id);
      clientId = proposal.clientId!;
      const now = new Date();
      if (OPEN_STATUSES.includes(proposal.status) && isExpired(proposal, now)) {
        await manager.update(
          Proposal,
          { id },
          { status: ProposalStatus.Expired },
        );
        return true;
      }
      if (proposal.status === ProposalStatus.Sent) {
        await manager.update(
          Proposal,
          { id },
          { status: ProposalStatus.Viewed, viewedAt: now },
        );
        return true;
      }
      return false;
    });
    if (changed) {
      await this.dashboardCache.invalidateClient(clientId);
    }
    return this.getReceived(clientIds, id);
  }

  /**
   * Accepts the proposal with a typed signature. This creates the project
   * (or activates the one it was written for, superseding its other open
   * proposals), generates the project's billable milestones from the agreed
   * payment schedule, and invoices them: drafts for every step, with the
   * deposit sent.
   */
  async accept(
    userId: string,
    id: string,
    input: AcceptProposalDto,
    context: AcceptanceContext,
  ): Promise<ProposalResponseDto> {
    const clientIds = await this.findClientIds(userId);
    const now = new Date();
    let ownerId = '';
    let clientId = '';

    const expired = await this.dataSource.transaction(async (manager) => {
      // Lock order is proposal, then project, the same as sending.
      const proposal = await this.lockReceived(manager, clientIds, id);
      ownerId = proposal.ownerId;
      clientId = proposal.clientId!;
      if (this.expireIfStale(proposal, now)) {
        await manager.update(
          Proposal,
          { id },
          { status: ProposalStatus.Expired },
        );
        return true;
      }
      assertCanAccept(proposal, input, now);

      const milestones = await manager.find(ProposalMilestone, {
        where: { proposalId: id },
        order: { position: 'ASC' },
      });
      const project = await this.activateProject(
        manager,
        proposal,
        milestones,
        now,
      );

      await manager.update(
        Proposal,
        { id },
        {
          status: ProposalStatus.Accepted,
          respondedAt: now,
          termsAcceptedAt: now,
          acceptedByName: input.signatureName.trim(),
          acceptedIp: context.ip?.slice(0, 45) ?? null,
          acceptedUserAgent: context.userAgent?.slice(0, 255) ?? null,
          // Set together: the database requires them to match once accepted.
          projectId: project.id,
          acceptedProjectId: project.id,
        },
      );
      const schedule = await this.createSchedule(
        manager,
        project.id,
        proposal,
        milestones,
      );
      // Bill the agreed terms right away: a draft invoice per step, and the
      // deposit, owed on acceptance, sent.
      await invoiceSchedule(
        manager,
        {
          ownerId: proposal.ownerId,
          project: { ...project, clientId: proposal.clientId },
          proposal,
          schedule,
        },
        now,
      );
      return false;
    });

    await this.dashboardCache.invalidate(ownerId);
    await this.dashboardCache.invalidateClient(clientId);
    if (expired) {
      throw new ConflictException('This proposal has expired');
    }
    return this.getReceived(clientIds, id);
  }

  async decline(
    userId: string,
    id: string,
    input: DeclineProposalDto,
  ): Promise<ProposalResponseDto> {
    const clientIds = await this.findClientIds(userId);
    const now = new Date();
    let ownerId = '';
    let clientId = '';

    const expired = await this.dataSource.transaction(async (manager) => {
      const proposal = await this.lockReceived(manager, clientIds, id);
      ownerId = proposal.ownerId;
      clientId = proposal.clientId!;
      if (this.expireIfStale(proposal, now)) {
        await manager.update(
          Proposal,
          { id },
          { status: ProposalStatus.Expired },
        );
        return true;
      }
      assertCanRespond(proposal, ProposalStatus.Declined, now);
      await manager.update(
        Proposal,
        { id },
        {
          status: ProposalStatus.Declined,
          respondedAt: now,
          declineReason: input.reason?.trim() || null,
        },
      );
      return false;
    });

    await this.dashboardCache.invalidate(ownerId);
    await this.dashboardCache.invalidateClient(clientId);
    if (expired) {
      throw new ConflictException('This proposal has expired');
    }
    return this.getReceived(clientIds, id);
  }

  /**
   * Creates the project from the proposal, or, for a proposal written for an
   * existing project, activates that project and fills in what it lacks.
   * Returns the project id.
   */
  private async activateProject(
    manager: EntityManager,
    proposal: Proposal,
    milestones: ProposalMilestone[],
    now: Date,
  ): Promise<{ id: string; name: string }> {
    const startDate = proposal.estimatedStartDate;
    const dueDate =
      milestones.reduce<string | null>(
        (latest, milestone) =>
          milestone.dueDate && (!latest || milestone.dueDate > latest)
            ? milestone.dueDate
            : latest,
        null,
      ) ??
      estimateDueDate(
        startDate,
        proposal.estimatedDuration,
        proposal.durationUnit,
      );

    if (proposal.projectId === null) {
      const id = randomUUID();
      await manager.insert(Project, {
        id,
        ownerId: proposal.ownerId,
        clientId: proposal.clientId,
        name: proposal.title,
        description: proposal.problemStatement,
        deliverables: proposal.deliverables,
        status: ProjectStatus.Active,
        startDate,
        dueDate,
        activatedAt: now,
      });
      return { id, name: proposal.title };
    }

    // Lock order is proposal, then project, the same as sending.
    const project = await manager.findOne(Project, {
      where: { id: proposal.projectId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    assertProjectTransition(project.status, ProjectStatus.Active);

    await manager.update(
      Proposal,
      {
        projectId: project.id,
        id: Not(proposal.id),
        status: In([ProposalStatus.Draft, ...OPEN_STATUSES]),
      },
      { status: ProposalStatus.Superseded },
    );
    await manager.update(
      Project,
      { id: project.id },
      {
        status: ProjectStatus.Active,
        activatedAt: now,
        deliverables: project.deliverables ?? proposal.deliverables,
        startDate: project.startDate ?? startDate,
        dueDate: project.dueDate ?? dueDate,
      },
    );
    return { id: project.id, name: project.name };
  }

  /** The project's billable steps, priced from the accepted total. */
  private async createSchedule(
    manager: EntityManager,
    projectId: string,
    proposal: Proposal,
    milestones: ProposalMilestone[],
  ): Promise<ProjectMilestone[]> {
    if ((await manager.count(ProjectMilestone, { where: { projectId } })) > 0) {
      return manager.find(ProjectMilestone, {
        where: { projectId },
        order: { position: 'ASC' },
      });
    }
    const steps = buildProjectSchedule({
      depositPercent: proposal.depositPercent,
      milestones,
    });
    const amounts = splitByPercent(
      toHundredths(proposal.total ?? 0),
      steps.map((step) => step.percent),
    );
    const rows = steps.map(
      (step, position) =>
        ({
          id: randomUUID(),
          projectId,
          position,
          kind: step.kind,
          title: step.title,
          deliverables: step.deliverables,
          percent: step.percent,
          amount: fromHundredths(amounts[position]),
          currency: proposal.currency,
          dueDate: step.dueDate,
          completedAt: null,
          invoiceId: null,
        }) as ProjectMilestone,
    );
    await manager.insert(ProjectMilestone, rows);
    return rows;
  }

  private expireIfStale(proposal: Proposal, now: Date): boolean {
    return OPEN_STATUSES.includes(proposal.status) && isExpired(proposal, now);
  }

  // Open proposals whose validUntil has passed become expired.
  private async expireStale(
    manager: EntityManager,
    clientIds: string[],
  ): Promise<void> {
    const result = await manager.update(
      Proposal,
      {
        clientId: In(clientIds),
        status: In(OPEN_STATUSES),
        validUntil: LessThanOrEqual(new Date()),
      },
      { status: ProposalStatus.Expired },
    );
    if (result.affected) {
      await Promise.all(
        clientIds.map((id) => this.dashboardCache.invalidateClient(id)),
      );
    }
  }

  /** The person's client records, one per owner who added them. */
  private async findClientIds(userId: string): Promise<string[]> {
    const clients = await this.clients.find({
      where: { userId },
      select: { id: true },
    });
    if (clients.length === 0) {
      throw new NotFoundException('You are not a client');
    }
    return clients.map((client) => client.id);
  }

  private async getReceived(
    clientIds: string[],
    id: string,
  ): Promise<ProposalResponseDto> {
    const proposal = await this.proposals.findOne({
      where: {
        id,
        clientId: In(clientIds),
        status: Not(ProposalStatus.Draft),
      },
      relations: { milestones: true },
      order: { milestones: { position: 'ASC' } },
    });
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }
    return toProposalResponse(proposal);
  }

  private async lockReceived(
    manager: EntityManager,
    clientIds: string[],
    id: string,
  ): Promise<Proposal> {
    const proposal = await manager.findOne(Proposal, {
      where: {
        id,
        clientId: In(clientIds),
        status: Not(ProposalStatus.Draft),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }
    return proposal;
  }
}
