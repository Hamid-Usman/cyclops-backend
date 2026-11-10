import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';
import { Client } from '../client/client.entity';
import { moneyColumn, numberTransformer } from '../common/number.transformer';
import { Project } from '../project/project.entity';

export enum InvoiceStatus {
  Draft = 'draft',
  Sent = 'sent',
  Paid = 'paid',
  Void = 'void',
}

@Entity('invoices')
@Index('UQ_invoices_owner_id_number', ['ownerId', 'number'], { unique: true })
@Index('IDX_invoices_owner_id_status', ['ownerId', 'status'])
@Index('IDX_invoices_project_id', ['projectId'])
@Index('IDX_invoices_client_id', ['clientId'])
export class Invoice {
  @PrimaryColumn('char', { length: 36 })
  id: string;

  // The user who bills the client.
  @Column({ name: 'owner_id', type: 'char', length: 36 })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({
    name: 'owner_id',
    foreignKeyConstraintName: 'FK_invoices_owner_id',
  })
  owner: User;

  @Column({ name: 'client_id', type: 'char', length: 36 })
  clientId: string;

  @ManyToOne(() => Client)
  @JoinColumn({
    name: 'client_id',
    foreignKeyConstraintName: 'FK_invoices_client_id',
  })
  client: Client;

  @Column({ name: 'project_id', type: 'char', length: 36 })
  projectId: string;

  @ManyToOne(() => Project)
  @JoinColumn({
    name: 'project_id',
    foreignKeyConstraintName: 'FK_invoices_project_id',
  })
  project: Project;

  // Counts up per owner (shown as INV-0001). Given when the invoice is sent,
  // so deleted drafts don't leave gaps.
  @Column({ type: 'int', unsigned: true, nullable: true })
  number: number | null;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.Draft })
  status: InvoiceStatus;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Shown to the client, e.g. bank details or a thank-you note.
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // ISO 4217 code, e.g. "USD".
  @Column({ type: 'char', length: 3, default: 'USD' })
  currency: string;

  // Before tax.
  @Column({ ...moneyColumn })
  amount: number;

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

  // Worked out from amount and taxRate whenever either changes.
  @Column({ ...moneyColumn, name: 'tax_amount' })
  taxAmount: number;

  @Column({ ...moneyColumn })
  total: number;

  // Set when the invoice is sent.
  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate: string | null;

  // Defaults to 14 days after the issue date when sent without one.
  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'sent_at', type: 'datetime', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'voided_at', type: 'datetime', nullable: true })
  voidedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
