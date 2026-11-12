import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';
import { Client } from '../client/client.entity';
import { moneyColumn, numberTransformer } from '../common/number.transformer';
import { Project } from '../project/project.entity';
import { ProposalMilestone } from './proposal-milestone.entity';

export enum ProposalStatus {
  Draft = 'draft',
  Sent = 'sent',
  Viewed = 'viewed',
  Accepted = 'accepted',
  Declined = 'declined',
  Expired = 'expired',
  Withdrawn = 'withdrawn',
  Superseded = 'superseded',
}

export enum DurationUnit {
  Days = 'days',
  Weeks = 'weeks',
  Months = 'months',
}

// The database allows only one accepted proposal per project: see
// `acceptedProjectId` below.
@Entity('proposals')
@Index('IDX_proposals_project_id_status', ['projectId', 'status'])
@Index('IDX_proposals_client_id', ['clientId'])
@Index('IDX_proposals_owner_id', ['ownerId'])
export class Proposal {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  // The user who wrote and sent the proposal.
  @Column({ name: 'owner_id', type: 'char', length: 36 })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({
    name: 'owner_id',
    foreignKeyConstraintName: 'FK_proposals_owner_id',
  })
  owner: User;

  @Column({ name: 'client_id', type: 'char', length: 36 })
  clientId: string;

  @ManyToOne(() => Client)
  @JoinColumn({
    name: 'client_id',
    foreignKeyConstraintName: 'FK_proposals_client_id',
  })
  client: Client;

  // Null when the proposal is sent to a client without a project: accepting
  // it creates the project.
  @Column({ name: 'project_id', type: 'char', length: 36, nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { nullable: true })
  @JoinColumn({
    name: 'project_id',
    foreignKeyConstraintName: 'FK_proposals_project_id',
  })
  project: Project | null;

  // The payment schedule, in order. Loaded only where needed.
  @OneToMany(() => ProposalMilestone, (milestone) => milestone.proposal)
  milestones?: ProposalMilestone[];

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({
    type: 'enum',
    enum: ProposalStatus,
    default: ProposalStatus.Draft,
  })
  status: ProposalStatus;

  // 1. What problem are you solving?
  @Column({ name: 'problem_statement', type: 'text', nullable: true })
  problemStatement: string | null;

  // 2. What exactly will you deliver?
  @Column({ type: 'text', nullable: true })
  deliverables: string | null;

  // 3. How long will it take?
  @Column({ name: 'estimated_start_date', type: 'date', nullable: true })
  estimatedStartDate: string | null;

  @Column({
    name: 'estimated_duration',
    type: 'smallint',
    unsigned: true,
    nullable: true,
  })
  estimatedDuration: number | null;

  @Column({
    name: 'duration_unit',
    type: 'enum',
    enum: DurationUnit,
    nullable: true,
  })
  durationUnit: DurationUnit | null;

  // 4. How much will it cost? The price before discount and tax.
  @Column({ ...moneyColumn, nullable: true })
  price: number | null;

  // ISO 4217 code, e.g. "USD".
  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: string;

  @Column({ ...moneyColumn, default: 0 })
  discount: number;

  // A percent, e.g. 7.5 means 7.5%.
  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 5,
    scale: 2,
    unsigned: true,
    default: 0,
    transformer: numberTransformer,
  })
  taxRate: number;

  @Column({
    name: 'deposit_percent',
    type: 'tinyint',
    unsigned: true,
    default: 0,
  })
  depositPercent: number;

  // Totals are calculated and saved when the proposal is sent.
  @Column({ ...moneyColumn, nullable: true })
  subtotal: number | null;

  @Column({ ...moneyColumn, name: 'tax_amount', nullable: true })
  taxAmount: number | null;

  @Column({ ...moneyColumn, nullable: true })
  total: number | null;

  @Column({ ...moneyColumn, nullable: true })
  deposit: number | null;

  // 5. What terms must the client agree to?
  @Column({ type: 'text', nullable: true })
  terms: string | null;

  // SHA-256 of `terms`, saved when sent. Proves which terms were accepted.
  @Column({ name: 'terms_hash', type: 'char', length: 64, nullable: true })
  termsHash: string | null;

  @Column({ name: 'valid_until', type: 'datetime', nullable: true })
  validUntil: Date | null;

  @Column({ name: 'sent_at', type: 'datetime', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'viewed_at', type: 'datetime', nullable: true })
  viewedAt: Date | null;

  @Column({ name: 'responded_at', type: 'datetime', nullable: true })
  respondedAt: Date | null;

  // Typed signature from the client when accepting.
  @Column({
    name: 'accepted_by_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  acceptedByName: string | null;

  @Column({ name: 'accepted_ip', type: 'varchar', length: 45, nullable: true })
  acceptedIp: string | null;

  @Column({
    name: 'accepted_user_agent',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  acceptedUserAgent: string | null;

  @Column({ name: 'terms_accepted_at', type: 'datetime', nullable: true })
  termsAcceptedAt: Date | null;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason: string | null;

  // Set to projectId when the proposal is accepted, and NULL otherwise. The
  // database enforces both, and its unique index stops a project from having
  // two accepted proposals.
  @Column({
    name: 'accepted_project_id',
    type: 'char',
    length: 36,
    nullable: true,
  })
  acceptedProjectId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
