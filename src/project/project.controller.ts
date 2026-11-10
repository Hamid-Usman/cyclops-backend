import {
  Body,
  Controller,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
} from './project.dto';
import { ProjectResponseDto } from './project.responses';
import { ProjectService } from './project.service';

@Controller('projects')
@ApiTags('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a project',
    description:
      'New projects are always inactive until the client accepts a proposal.',
  })
  @ApiCreatedResponse({ type: ProjectResponseDto })
  @ApiNotFoundResponse({ description: 'Client not found' })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateProjectDto,
  ) {
    return this.projectService.create(request.user.sub, input);
  }

  @Get()
  @ApiOperation({ summary: 'List your projects' })
  @ApiOkResponse({ type: ProjectResponseDto, isArray: true })
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListProjectsQueryDto,
  ) {
    return this.projectService.findAll(request.user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of your projects' })
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiNotFoundResponse({ description: 'Project not found' })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projectService.findOne(request.user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit, complete or cancel a project' })
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid fields or dates' })
  @ApiConflictResponse({ description: 'Status change not allowed' })
  @ApiNotFoundResponse({ description: 'Project not found' })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateProjectDto,
  ) {
    return this.projectService.update(request.user.sub, id, input);
  }
}
