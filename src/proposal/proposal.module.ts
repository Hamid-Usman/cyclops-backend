import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Client } from '../client/client.entity';
import { ProjectMilestone } from '../project/project-milestone.entity';
import { ProposalMilestone } from './proposal-milestone.entity';
import { ProjectModule } from '../project/project.module';
import { ClientProposalController } from './client-proposal.controller';
import { ClientProposalService } from './client-proposal.service';
import { ProposalController } from './proposal.controller';
import { Proposal } from './proposal.entity';
import { ProposalService } from './proposal.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Proposal,
      ProposalMilestone,
      Client,
      ProjectMilestone,
    ]),
    ProjectModule,
    AuthModule,
  ],
  controllers: [ProposalController, ClientProposalController],
  providers: [ProposalService, ClientProposalService],
})
export class ProposalModule {}
