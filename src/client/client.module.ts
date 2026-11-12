import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/user.entity';
import { Invoice } from '../invoice/invoice.entity';
import { ProjectMilestone } from '../project/project-milestone.entity';
import { Project } from '../project/project.entity';
import { Proposal } from '../proposal/proposal.entity';
import { ClientPortalService } from './client-portal.service';
import { ClientController } from './client.controller';
import { Client } from './client.entity';
import { ClientService } from './client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Client,
      User,
      Project,
      Proposal,
      Invoice,
      ProjectMilestone,
    ]),
    AuthModule,
  ],
  controllers: [ClientController],
  providers: [ClientService, ClientPortalService],
})
export class ClientModule {}
