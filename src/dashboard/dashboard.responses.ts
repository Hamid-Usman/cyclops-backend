import { ApiProperty } from '@nestjs/swagger';

export class CurrencyTotalDto {
  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 2080.12, description: 'Including tax' })
  amount: number;
}

export class PendingInvoicesDto {
  @ApiProperty({ example: 3, description: 'Sent and not yet paid' })
  count: number;

  @ApiProperty({ example: 1, description: 'Pending and past the due date' })
  overdueCount: number;

  @ApiProperty({
    type: CurrencyTotalDto,
    isArray: true,
    description: 'Amount still owed, one entry per currency',
  })
  totals: CurrencyTotalDto[];
}

export class ProposalCountsDto {
  @ApiProperty({ example: 6, description: 'All your proposals' })
  total: number;

  @ApiProperty({ example: 2 })
  drafts: number;

  @ApiProperty({ example: 3, description: 'Sent or viewed, not answered' })
  awaitingResponse: number;

  @ApiProperty({ example: 1 })
  accepted: number;
}

export class DashboardResponseDto {
  @ApiProperty({
    example: 4,
    description: 'Active clients you have at least one project with',
  })
  activeClients: number;

  @ApiProperty({ example: 2 })
  activeProjects: number;

  @ApiProperty({ type: PendingInvoicesDto })
  pendingInvoices: PendingInvoicesDto;

  @ApiProperty({ type: ProposalCountsDto })
  proposals: ProposalCountsDto;
}

export class AttentionInvoiceDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'INV-0001' })
  number: string;

  @ApiProperty({ example: 'Deposit for checkout redesign' })
  title: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty({ example: 'Checkout redesign' })
  projectName: string;

  @ApiProperty()
  clientId: string;

  @ApiProperty({ example: 'Acme Ltd' })
  clientName: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 1040.06, description: 'Including tax' })
  total: number;

  @ApiProperty({ example: '2026-11-12' })
  dueDate: string;

  @ApiProperty({
    example: 2,
    description: 'Days until the due date. Negative when overdue.',
  })
  daysUntilDue: number;

  @ApiProperty()
  isOverdue: boolean;
}

export class AttentionProjectDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Checkout redesign' })
  name: string;

  @ApiProperty()
  clientId: string;

  @ApiProperty({ example: 'Acme Ltd' })
  clientName: string;

  @ApiProperty({ example: '2026-11-15' })
  dueDate: string;

  @ApiProperty({
    example: 5,
    description: 'Days until the deadline. Negative when it has passed.',
  })
  daysUntilDue: number;

  @ApiProperty()
  isOverdue: boolean;
}

export class AttentionResponseDto {
  @ApiProperty({ example: 7, description: 'The look-ahead window used' })
  days: number;

  @ApiProperty({
    type: AttentionInvoiceDto,
    isArray: true,
    description:
      'Sent invoices that are overdue or due within the window, soonest first',
  })
  invoices: AttentionInvoiceDto[];

  @ApiProperty({
    type: AttentionProjectDto,
    isArray: true,
    description:
      'Active projects past their deadline or due within the window, soonest first',
  })
  projects: AttentionProjectDto[];
}
