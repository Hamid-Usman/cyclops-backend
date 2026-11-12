import { ApiProperty } from '@nestjs/swagger';
import { PublicUserResponseDto } from '../auth/auth.responses';
import { CurrencyTotalDto } from '../dashboard/dashboard.responses';
import { InvoiceResponseDto } from '../invoice/invoice.dto';
import {
  ProjectMilestoneResponseDto,
  ProjectResponseDto,
} from '../project/project.responses';
import { ProposalSummaryResponseDto } from '../proposal/proposal.responses';
import { ClientStatus } from './client.entity';

export class ClientResponseDto {
  @ApiProperty({ example: '6b1f8e2c-3a4d-4f5e-9a1b-2c3d4e5f6a7b' })
  id: string;

  @ApiProperty({ enum: ClientStatus, example: ClientStatus.Active })
  status: ClientStatus;

  @ApiProperty({ type: PublicUserResponseDto })
  user: PublicUserResponseDto;
}

export class ClientOverviewSummaryDto {
  @ApiProperty({ example: 1 })
  activeProjects: number;

  @ApiProperty({ example: 1, description: 'Sent or viewed, not answered yet' })
  proposalsAwaitingResponse: number;

  @ApiProperty({ example: 2, description: 'Sent and not yet paid' })
  unpaidInvoices: number;

  @ApiProperty({ example: 0 })
  overdueInvoices: number;

  @ApiProperty({
    type: CurrencyTotalDto,
    isArray: true,
    description: 'What you still owe, one entry per currency',
  })
  amountDue: CurrencyTotalDto[];
}

export class ClientOverviewResponseDto {
  @ApiProperty({ type: ClientResponseDto })
  client: ClientResponseDto;

  @ApiProperty({ type: ClientOverviewSummaryDto })
  summary: ClientOverviewSummaryDto;

  @ApiProperty({ type: ProjectResponseDto, isArray: true })
  projects: ProjectResponseDto[];

  @ApiProperty({
    type: ProposalSummaryResponseDto,
    isArray: true,
    description: 'Proposals sent to you (drafts are not shown)',
  })
  proposals: ProposalSummaryResponseDto[];

  @ApiProperty({
    type: InvoiceResponseDto,
    isArray: true,
    description: 'Invoices sent to you (drafts are not shown)',
  })
  invoices: InvoiceResponseDto[];

  @ApiProperty({
    type: ProjectMilestoneResponseDto,
    isArray: true,
    description:
      'Payment schedules of your projects. Invoices still in draft are not shown.',
  })
  milestones: ProjectMilestoneResponseDto[];
}
