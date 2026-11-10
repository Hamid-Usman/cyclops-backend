import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
@ApiTags('app')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get the application greeting' })
  @ApiOkResponse({ description: 'Application greeting', type: String })
  getHello(): string {
    return this.appService.getHello();
  }
}
