import { ApiProperty } from '@nestjs/swagger';
import { InvoiceStatus } from '../invoice/invoice.entity';
import { formatInvoiceNumber } from '../invoice/invoice.rules';
import { MilestoneKind, ProjectMilestone } from './project-milestone.entity';
import { Project, ProjectStatus } from './project.entity';

export class ProjectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  clientId: string;

  @ApiProperty({ example: 'Checkout redesign' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'From the accepted proposal',
  })
  deliverables: string | null;

  @ApiProperty({ enum: ProjectStatus, example: ProjectStatus.Inactive })
  status: ProjectStatus;

  @ApiProperty({ type: String, nullable: true, example: '2026-12-01' })
  startDate: string | null;

  @ApiProperty({ type: String, nullable: true, example: '2027-01-31' })
  dueDate: string | null;

  @ApiProperty({ type: Date, nullable: true })
  activatedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export function toProjectResponse(project: Project): ProjectResponseDto {
  return {
    id: project.id,
    clientId: project.clientId,
    name: project.name,
    description: project.description,
    deliverables: project.deliverables ?? null,
    status: project.status,
    startDate: project.startDate,
    dueDate: project.dueDate,
    activatedAt: project.activatedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

export class MilestoneInvoiceDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: String, nullable: true, example: 'INV-0003' })
  number: string | null;

  @ApiProperty({ enum: InvoiceStatus })
  status: InvoiceStatus;

  @ApiProperty({ example: 483.75 })
  total: number;
}

export class ProjectMilestoneResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty({ enum: MilestoneKind })
  kind: MilestoneKind;

  @ApiProperty({ example: 'Design approved' })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  deliverables: string | null;

  @ApiProperty({ example: 25 })
  percent: number;

  @ApiProperty({ example: 483.75, description: 'Including tax' })
  amount: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ type: String, nullable: true })
  dueDate: string | null;

  @ApiProperty({ type: Date, nullable: true })
  completedAt: Date | null;

  @ApiProperty({
    type: MilestoneInvoiceDto,
    nullable: true,
    description:
      'The invoice billing this milestone. A voided invoice frees the milestone to be billed again.',
  })
  invoice: MilestoneInvoiceDto | null;
}

/**
 * `hideDrafts`: clients never see draft invoices, so for them a milestone
 * whose invoice is still a draft shows as not invoiced yet.
 */
export function toMilestoneResponse(
  milestone: ProjectMilestone,
  { hideDrafts = false } = {},
): ProjectMilestoneResponseDto {
  const invoice = milestone.invoice;
  const visible =
    invoice && !(hideDrafts && invoice.status === InvoiceStatus.Draft);
  return {
    id: milestone.id,
    projectId: milestone.projectId,
    kind: milestone.kind,
    title: milestone.title,
    deliverables: milestone.deliverables,
    percent: milestone.percent,
    amount: milestone.amount,
    currency: milestone.currency,
    dueDate: milestone.dueDate,
    completedAt: milestone.completedAt,
    invoice: visible
      ? {
          id: invoice.id,
          number: formatInvoiceNumber(invoice.number),
          status: invoice.status,
          total: invoice.total,
        }
      : null,
  };
}
