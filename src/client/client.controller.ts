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
import { PaginationQueryDto } from '../common/pagination';
import { InvoiceResponseDto, ReportPaymentDto } from '../invoice/invoice.dto';
import { CreateClientDto, UpdateClientDto } from './client.dto';
import { ClientPortalService } from './client-portal.service';
import {
  ClientOverviewResponseDto,
  ClientResponseDto,
} from './client.responses';
import { ClientService } from './client.service';

@Controller('client')
@ApiTags('client')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
export class ClientController {
  constructor(
    private readonly clientService: ClientService,
    private readonly clientPortal: ClientPortalService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an existing user as a client, by email or id' })
  @ApiCreatedResponse({ type: ClientResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({
    description: 'You have already added this user as a client',
  })
  @ApiBadRequestResponse({ description: 'You cannot add yourself' })
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateClientDto) {
    return this.clientService.create(request.user.sub, input);
  }

  @Get()
  @ApiOperation({ summary: 'List the clients you added' })
  @ApiOkResponse({ type: ClientResponseDto, isArray: true })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query() page: PaginationQueryDto,
  ) {
    return this.clientService.findAll(request.user.sub, page);
  }

  @Get('me')
  @ApiOperation({ summary: "Get the current user's client record" })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiNotFoundResponse({ description: 'Client not found' })
  getMine(@Req() request: AuthenticatedRequest) {
    return this.clientService.findForUser(request.user.sub);
  }

  @Get('me/overview')
  @ApiOperation({
    summary: 'Your client portal',
    description:
      'For a user who is a client: their projects, and the proposals and invoices sent to them, with totals.',
  })
  @ApiOkResponse({ type: ClientOverviewResponseDto })
  @ApiNotFoundResponse({ description: 'You are not a client' })
  getMyOverview(@Req() request: AuthenticatedRequest) {
    return this.clientPortal.getOverview(request.user.sub);
  }

  @Post('me/invoices/:id/report-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tell the owner you paid an invoice',
    description:
      'Records when you paid and an optional reference. The owner confirms it by marking the invoice paid.',
  })
  @ApiOkResponse({ type: InvoiceResponseDto })
  @ApiNotFoundResponse({
    description: 'You are not a client, or no such invoice',
  })
  @ApiConflictResponse({ description: 'The invoice is already paid or void' })
  reportPayment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReportPaymentDto,
  ) {
    return this.clientPortal.reportPayment(request.user.sub, id, input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of your clients' })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiNotFoundResponse({ description: 'Client not found' })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientService.findOne(request.user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Change a client's status" })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiNotFoundResponse({ description: 'Client not found' })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateClientDto,
  ) {
    return this.clientService.update(request.user.sub, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a client' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Client not found' })
  @ApiConflictResponse({
    description:
      'The client has projects, proposals or invoices. Archive it instead.',
  })
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientService.remove(request.user.sub, id);
  }
}
