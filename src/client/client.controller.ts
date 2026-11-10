import {
  Body,
  Controller,
  Delete,
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
import { CreateClientDto } from './client.dto';
import { ClientResponseDto } from './client.responses';
import { ClientService } from './client.service';

@Controller('client')
@ApiTags('client')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
export class ClientController {
  constructor(private readonly clientService: ClientService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an existing user as a client, by email or id' })
  @ApiCreatedResponse({ type: ClientResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'This user is already a client' })
  create(@Body() input: CreateClientDto) {
    return this.clientService.create(input);
  }

  @Get()
  @ApiOperation({ summary: 'List clients' })
  @ApiOkResponse({ type: ClientResponseDto, isArray: true })
  findAll() {
    return this.clientService.findAll();
  }

  // @Get('me')
  // @ApiOperation({ summary: "Get the current user's client record" })
  // @ApiOkResponse({ type: ClientResponseDto })
  // @ApiNotFoundResponse({ description: 'Client not found' })
  // getMine(@Req() request: AuthenticatedRequest) {
  //   return this.clientService.findForUser(request.user.sub);
  // }

  @Get(':id')
  @ApiOperation({ summary: 'Get a client by id' })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiNotFoundResponse({ description: 'Client not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a client' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Client not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientService.remove(id);
  }
}
