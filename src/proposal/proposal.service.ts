import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Project, ProjectStatus } from '../project/project.entity';
import {
  CreateProposalDto,
  ListProposalsQueryDto,
  UpdateProposalDto,
} from './proposal.dto';
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

@Injectable()
export class ProposalService {
  constructor(
    @InjectRepository(Proposal)
    private readonly proposals: Repository<Proposal>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    ownerId: string,
    input: CreateProposalDto,
  ): Promise<ProposalResponseDto> {
    const id = randomUUID();

    await this.dataSource.transaction(async (manager) => {
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

      await manager.insert(Proposal, {
        id,
        ownerId,
        clientId: project.clientId,
        projectId: project.id,
        status: ProposalStatus.Draft,
        currency: 'USD',
        discount: 0,
        taxRate: 0,
        depositPercent: 0,
        ...toProposalFields(input),
      });
    });

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
    const proposal = await this.proposals.findOne({ where: { id, ownerId } });
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
    });
    return this.findOne(ownerId, id);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockDraft(manager, ownerId, id);
      await manager.delete(Proposal, { id });
    });
  }

  async send(ownerId: string, id: string): Promise<ProposalResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      // Lock order is proposal, then project. Accepting a proposal must lock
      // in the same order so the two can't deadlock.
      const proposal = await this.lockOwned(manager, ownerId, id);
      const project = await manager.findOne(Project, {
        where: { id: proposal.projectId },
        lock: { mode: 'pessimistic_write' },
      });
      if (project?.status !== ProjectStatus.Inactive) {
        throw new ConflictException(
          'Proposals can only be sent for inactive projects',
        );
      }

      const changes = prepareForSend(proposal, new Date());
      await manager.update(Proposal, { id }, changes);
    });

    // TODO(step 5): email the client a link to the proposal.
    return this.findOne(ownerId, id);
  }

  async withdraw(ownerId: string, id: string): Promise<ProposalResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const proposal = await this.lockOwned(manager, ownerId, id);
      assertProposalTransition(proposal.status, ProposalStatus.Withdrawn);
      await manager.update(
        Proposal,
        { id },
        { status: ProposalStatus.Withdrawn },
      );
    });
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
