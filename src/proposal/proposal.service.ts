import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DashboardCache } from '../cache/dashboard-cache.service';
import { Client } from '../client/client.entity';
import { assertPaymentSchedule } from '../project/milestone.rules';
import { Project, ProjectStatus } from '../project/project.entity';
import {
  CreateProposalDto,
  ListProposalsQueryDto,
  ProposalMilestoneInputDto,
  UpdateProposalDto,
} from './proposal.dto';
import { ProposalMilestone } from './proposal-milestone.entity';
import { Proposal, ProposalStatus } from './proposal.entity';
import {
  ProposalResponseDto,
  ProposalSummaryResponseDto,
  toProposalResponse,
  toProposalSummary,
} from './proposal.responses';
import { assertProposalTransition, prepareForSend } from './proposal.rules';

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Turns the optional fields of a create or edit request into column values.
// Fields left out of the request are left out of the result.
function toProposalFields(
  input: UpdateProposalDto | CreateProposalDto,
): Partial<Proposal> {
  const fields: Partial<Proposal> = {};
  if (input.title !== undefined) fields.title = input.title.trim();
  if (input.problemStatement !== undefined)
    fields.problemStatement = trimOrNull(input.problemStatement);
  if (input.deliverables !== undefined)
    fields.deliverables = trimOrNull(input.deliverables);
  if (input.estimatedStartDate !== undefined)
    fields.estimatedStartDate = input.estimatedStartDate;
  if (input.estimatedDuration !== undefined)
    fields.estimatedDuration = input.estimatedDuration;
  if (input.durationUnit !== undefined)
    fields.durationUnit = input.durationUnit;
  if (input.price !== undefined) fields.price = input.price;
  if (input.currency !== undefined) fields.currency = input.currency;
  if (input.discount !== undefined) fields.discount = input.discount;
  if (input.taxRate !== undefined) fields.taxRate = input.taxRate;
  if (input.depositPercent !== undefined)
    fields.depositPercent = input.depositPercent;
  if (input.terms !== undefined) fields.terms = trimOrNull(input.terms);
  if (input.validUntil !== undefined) fields.validUntil = input.validUntil;
  return fields;
}

// Loads the payment schedule with a proposal, in order.
const WITH_MILESTONES = {
  relations: { milestones: true },
  order: { milestones: { position: 'ASC' } },
} as const;

async function replaceMilestones(
  manager: EntityManager,
  proposalId: string,
  milestones: ProposalMilestoneInputDto[],
): Promise<void> {
  await manager.delete(ProposalMilestone, { proposalId });
  if (milestones.length === 0) {
    return;
  }
  await manager.insert(
    ProposalMilestone,
    milestones.map((milestone, position) => ({
      id: randomUUID(),
      proposalId,
      position,
      title: milestone.title.trim(),
      deliverables: trimOrNull(milestone.deliverables),
      percent: milestone.percent,
      dueDate: milestone.dueDate ?? null,
    })),
  );
}

@Injectable()
export class ProposalService {
  constructor(
    @InjectRepository(Proposal)
    private readonly proposals: Repository<Proposal>,
    private readonly dataSource: DataSource,
    private readonly dashboardCache: DashboardCache,
  ) {}

  async create(
    ownerId: string,
    input: CreateProposalDto,
  ): Promise<ProposalResponseDto> {
    const id = randomUUID();

    if (input.projectId !== undefined && input.clientId !== undefined) {
      throw new BadRequestException(
        'Send either projectId or clientId, not both',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      let clientId: string;
      let projectId: string | null = null;
      if (input.projectId !== undefined) {
        const project = await manager.findOne(Project, {
          where: { id: input.projectId, ownerId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!project) {
          throw new NotFoundException('Project not found');
        }
        if (project.status !== ProjectStatus.Inactive) {
          throw new ConflictException(
            'Proposals can only be made for inactive projects',
          );
        }
        clientId = project.clientId;
        projectId = project.id;
      } else {
        // No project yet: accepting the proposal creates it.
        const client = await manager.findOne(Client, {
          where: { id: input.clientId, ownerId },
        });
        if (!client) {
          throw new NotFoundException('Client not found');
        }
        if (client.userId === ownerId) {
          throw new BadRequestException(
            'You cannot send a proposal to yourself',
          );
        }
        clientId = client.id;
      }

      await manager.insert(Proposal, {
        id,
        ownerId,
        clientId,
        projectId,
        status: ProposalStatus.Draft,
        currency: 'USD',
        discount: 0,
        taxRate: 0,
        depositPercent: 0,
        ...toProposalFields(input),
      });
      if (input.milestones?.length) {
        await replaceMilestones(manager, id, input.milestones);
      }
    });
    await this.dashboardCache.invalidate(ownerId);

    return this.findOne(ownerId, id);
  }

  async findAll(
    ownerId: string,
    query: ListProposalsQueryDto,
  ): Promise<ProposalSummaryResponseDto[]> {
    const proposals = await this.proposals.find({
      where: {
        ownerId,
        ...(query.projectId !== undefined && { projectId: query.projectId }),
        ...(query.clientId !== undefined && { clientId: query.clientId }),
        ...(query.status !== undefined && { status: query.status }),
      },
      order: { createdAt: 'DESC' },
    });
    return proposals.map(toProposalSummary);
  }

  async findOne(ownerId: string, id: string): Promise<ProposalResponseDto> {
    const proposal = await this.proposals.findOne({
      ...WITH_MILESTONES,
      where: { id, ownerId },
    });
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }
    return toProposalResponse(proposal);
  }

  async update(
    ownerId: string,
    id: string,
    input: UpdateProposalDto,
  ): Promise<ProposalResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockDraft(manager, ownerId, id);
      const fields = toProposalFields(input);
      if (Object.keys(fields).length > 0) {
        await manager.update(Proposal, { id }, fields);
      }
      if (input.milestones !== undefined) {
        await replaceMilestones(manager, id, input.milestones);
      }
    });
    await this.dashboardCache.invalidate(ownerId);
    return this.findOne(ownerId, id);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockDraft(manager, ownerId, id);
      await manager.delete(Proposal, { id });
    });
    await this.dashboardCache.invalidate(ownerId);
  }

  async send(ownerId: string, id: string): Promise<ProposalResponseDto> {
    const clientId = await this.dataSource.transaction(async (manager) => {
      // Lock order is proposal, then project. Accepting a proposal must lock
      // in the same order so the two can't deadlock.
      const proposal = await this.lockOwned(manager, ownerId, id);
      if (proposal.projectId !== null) {
        const project = await manager.findOne(Project, {
          where: { id: proposal.projectId },
          lock: { mode: 'pessimistic_write' },
        });
        if (project?.status !== ProjectStatus.Inactive) {
          throw new ConflictException(
            'Proposals can only be sent for inactive projects',
          );
        }
      }

      const changes = prepareForSend(proposal, new Date());
      const milestones = await manager.find(ProposalMilestone, {
        where: { proposalId: id },
      });
      assertPaymentSchedule(proposal.depositPercent, milestones);
      await manager.update(Proposal, { id }, changes);
      return proposal.clientId;
    });
    await this.dashboardCache.invalidate(ownerId);
    await this.dashboardCache.invalidateClient(clientId);

    // TODO(step 5): email the client a link to the proposal.
    return this.findOne(ownerId, id);
  }

  async withdraw(ownerId: string, id: string): Promise<ProposalResponseDto> {
    const clientId = await this.dataSource.transaction(async (manager) => {
      const proposal = await this.lockOwned(manager, ownerId, id);
      assertProposalTransition(proposal.status, ProposalStatus.Withdrawn);
      await manager.update(
        Proposal,
        { id },
        { status: ProposalStatus.Withdrawn },
      );
      return proposal.clientId;
    });
    await this.dashboardCache.invalidate(ownerId);
    await this.dashboardCache.invalidateClient(clientId);
    return this.findOne(ownerId, id);
  }

  private async lockOwned(
    manager: EntityManager,
    ownerId: string,
    id: string,
  ): Promise<Proposal> {
    const proposal = await manager.findOne(Proposal, {
      where: { id, ownerId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }
    return proposal;
  }

  private async lockDraft(
    manager: EntityManager,
    ownerId: string,
    id: string,
  ): Promise<Proposal> {
    const proposal = await this.lockOwned(manager, ownerId, id);
    if (proposal.status !== ProposalStatus.Draft) {
      throw new ConflictException(
        'Only draft proposals can be changed. Withdraw it and create a new one instead.',
      );
    }
    return proposal;
  }
}
