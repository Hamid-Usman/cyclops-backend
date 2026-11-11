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
  CreateInvoiceDto,
  InvoiceResponseDto,
  ListInvoicesQueryDto,
  MarkInvoicePaidDto,
  UpdateInvoiceDto,
} from './invoice.dto';
import { InvoiceService } from './invoice.service';

const DRAFT_ONLY = 'The invoice is not a draft';

@Controller('invoices')
@ApiTags('invoices')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiNotFoundResponse({ description: 'Invoice or project not found' })
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a draft invoice for an active project' })
  @ApiCreatedResponse({ type: InvoiceResponseDto })
  @ApiConflictResponse({
    description: 'The project is not active or completed',
  })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateInvoiceDto,
  ) {
    return this.invoiceService.create(request.user.sub, input);
  }

  @Get()
  @ApiOperation({
    summary:
      'List your invoices, optionally by project, client, status or overdue',
  })
  @ApiOkResponse({ type: InvoiceResponseDto, isArray: true })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.invoiceService.findAll(request.user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an invoice' })
  @ApiOkResponse({ type: InvoiceResponseDto })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoiceService.findOne(request.user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a draft invoice' })
  @ApiOkResponse({ type: InvoiceResponseDto })
  @ApiConflictResponse({ description: DRAFT_ONLY })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateInvoiceDto,
  ) {
    return this.invoiceService.update(request.user.sub, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft invoice' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: DRAFT_ONLY })
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoiceService.remove(request.user.sub, id);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a draft invoice',
    description:
      'Gives it the next invoice number and sets the issue date to today. The due date defaults to 14 days later.',
  })
  @ApiOkResponse({ type: InvoiceResponseDto })
  @ApiBadRequestResponse({
    description: 'Amount is 0, or the due date is in the past',
  })
  @ApiConflictResponse({
    description: 'Not a draft, or the project is not active or completed',
  })
  send(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoiceService.send(request.user.sub, id);
  }

  @Post(':id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that a sent invoice was paid' })
  @ApiOkResponse({ type: InvoiceResponseDto })
  @ApiBadRequestResponse({ description: 'Payment date is in the future' })
  @ApiConflictResponse({ description: 'The invoice is not sent' })
  markPaid(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: MarkInvoicePaidDto,
  ) {
    return this.invoiceService.markPaid(request.user.sub, id, input);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a sent invoice that will not be paid' })
  @ApiOkResponse({ type: InvoiceResponseDto })
  @ApiConflictResponse({ description: 'The invoice is not sent' })
  void(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoiceService.void(request.user.sub, id);
  }
}
