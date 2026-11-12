import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientProposalService } from './client-proposal.service';
import { AcceptProposalDto, DeclineProposalDto } from './proposal.dto';
import {
  ProposalResponseDto,
  ProposalSummaryResponseDto,
} from './proposal.responses';

type RequestWithClientInfo = AuthenticatedRequest & {
  ip?: string;
  headers: { 'user-agent'?: string };
};

// Proposals as seen by the client they were sent to.
@Controller('received-proposals')
@ApiTags('received proposals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiNotFoundResponse({
  description: 'You are not a client, or the proposal was not sent to you',
})
export class ClientProposalController {
  constructor(private readonly clientProposals: ClientProposalService) {}

  @Get()
  @ApiOperation({ summary: 'List the proposals sent to you' })
  @ApiOkResponse({ type: ProposalSummaryResponseDto, isArray: true })
  findAll(@Req() request: AuthenticatedRequest) {
    return this.clientProposals.findAll(request.user.sub);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Open a proposal sent to you',
    description: 'The first time a sent proposal is opened it becomes viewed.',
  })
  @ApiOkResponse({ type: ProposalResponseDto })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientProposals.findOne(request.user.sub, id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept a proposal',
    description:
      'Signs with a typed name and agrees to the terms. The project becomes active and its other open proposals are superseded.',
  })
  @ApiOkResponse({ type: ProposalResponseDto })
  @ApiBadRequestResponse({ description: 'The terms were not agreed to' })
  @ApiConflictResponse({
    description:
      'The proposal is expired or already answered, the terms changed, or the project is no longer inactive',
  })
  accept(
    @Req() request: RequestWithClientInfo,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: AcceptProposalDto,
  ) {
    return this.clientProposals.accept(request.user.sub, id, input, {
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a proposal' })
  @ApiOkResponse({ type: ProposalResponseDto })
  @ApiConflictResponse({
    description: 'The proposal is expired or already answered',
  })
  decline(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: DeclineProposalDto,
  ) {
    return this.clientProposals.decline(request.user.sub, id, input);
  }
}
