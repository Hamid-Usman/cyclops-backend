import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateProposalDto,
  ListProposalsQueryDto,
  UpdateProposalDto,
} from './proposal.dto';
import {
  ProposalResponseDto,
  ProposalSummaryResponseDto,
} from './proposal.responses';
import { ProposalService } from './proposal.service';

const DRAFT_ONLY = 'The proposal is not a draft';

@Controller('proposals')
@ApiTags('proposals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiNotFoundResponse({ description: 'Proposal or project not found' })
export class ProposalController {
  constructor(private readonly proposalService: ProposalService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a draft proposal for an inactive project' })
  @ApiCreatedResponse({ type: ProposalResponseDto })
  @ApiConflictResponse({ description: 'The project is not inactive' })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateProposalDto,
  ) {
    return this.proposalService.create(request.user.sub, input);
  }

  @Get()
  @ApiOperation({
    summary: 'List your proposals, optionally by project, client or status',
  })
  @ApiOkResponse({ type: ProposalSummaryResponseDto, isArray: true })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListProposalsQueryDto,
  ) {
    return this.proposalService.findAll(request.user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a proposal with all its sections' })
  @ApiOkResponse({ type: ProposalResponseDto })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.proposalService.findOne(request.user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a draft proposal' })
  @ApiOkResponse({ type: ProposalResponseDto })
  @ApiConflictResponse({ description: DRAFT_ONLY })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProposalDto,
  ) {
    return this.proposalService.update(request.user.sub, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft proposal' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: DRAFT_ONLY })
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.proposalService.remove(request.user.sub, id);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a draft to the client',
    description:
      'All five sections must be filled in. Totals and the terms are locked from here on.',
  })
  @ApiOkResponse({ type: ProposalResponseDto })
  @ApiBadRequestResponse({
    description: 'Sections are missing (listed in missingSections)',
  })
  @ApiConflictResponse({
    description: 'Not a draft, or the project is not inactive',
  })
  send(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.proposalService.send(request.user.sub, id);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw a proposal the client has not answered' })
  @ApiOkResponse({ type: ProposalResponseDto })
  @ApiConflictResponse({ description: 'The proposal cannot be withdrawn' })
  withdraw(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.proposalService.withdraw(request.user.sub, id);
  }
}
