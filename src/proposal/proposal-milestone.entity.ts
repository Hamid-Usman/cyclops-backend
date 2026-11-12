import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { numberTransformer } from '../common/number.transformer';
import { Proposal } from './proposal.entity';

// One step of a proposal's payment schedule: what is delivered, and what
// share of the total is billed for it.
@Entity('proposal_milestones')
@Index('IDX_proposal_milestones_proposal_id_position', [
  'proposalId',
  'position',
])
export class ProposalMilestone {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ name: 'proposal_id', type: 'char', length: 36 })
  proposalId: string;

  @ManyToOne(() => Proposal, (proposal) => proposal.milestones, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'proposal_id',
    foreignKeyConstraintName: 'FK_proposal_milestones_proposal_id',
  })
  proposal: Proposal;

  @Column({ type: 'smallint', unsigned: true })
  position: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  deliverables: string | null;

  // Share of the proposal total, e.g. 25.5 for 25.5%.
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    unsigned: true,
    transformer: numberTransformer,
  })
  percent: number;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;
}
