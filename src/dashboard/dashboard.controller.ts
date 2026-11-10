import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AttentionQueryDto } from './dashboard.dto';
import {
  AttentionResponseDto,
  DashboardResponseDto,
} from './dashboard.responses';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@ApiTags('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Counts of active clients, active projects and pending invoices',
  })
  @ApiOkResponse({ type: DashboardResponseDto })
  getSummary(@Req() request: AuthenticatedRequest) {
    return this.dashboardService.getSummary(request.user.sub);
  }

  @Get('attention')
  @ApiOperation({
    summary: 'Payments and project deadlines that are overdue or due soon',
  })
  @ApiOkResponse({ type: AttentionResponseDto })
  getAttention(
    @Req() request: AuthenticatedRequest,
    @Query() query: AttentionQueryDto,
  ) {
    return this.dashboardService.getAttention(request.user.sub, query.days);
  }
}
