import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { moneyColumn, numberTransformer } from '../common/number.transformer';
import { Invoice } from '../invoice/invoice.entity';
import { Project } from './project.entity';

export enum MilestoneKind {
  Deposit = 'deposit',
  Milestone = 'milestone',
  // What is left after the deposit when the proposal had no milestones.
  Balance = 'balance',
}

// A billable step of a project, generated from the accepted proposal.
@Entity('project_milestones')
@Index('IDX_project_milestones_project_id_position', ['projectId', 'position'])
export class ProjectMilestone {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  @Column({ name: 'project_id', type: 'char', length: 36 })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'project_id',
    foreignKeyConstraintName: 'FK_project_milestones_project_id',
  })
  project: Project;

  @Column({ type: 'smallint', unsigned: true })
  position: number;

  @Column({ type: 'enum', enum: MilestoneKind })
  kind: MilestoneKind;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  deliverables: string | null;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    unsigned: true,
    transformer: numberTransformer,
  })
  percent: number;

  // This share of the agreed total, including tax.
  @Column({ ...moneyColumn })
  amount: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt: Date | null;

  // The invoice billing this milestone, once generated.
  @Column({ name: 'invoice_id', type: 'char', length: 36, nullable: true })
  invoiceId: string | null;

  @ManyToOne(() => Invoice, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'invoice_id',
    foreignKeyConstraintName: 'FK_project_milestones_invoice_id',
  })
  invoice: Invoice | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
