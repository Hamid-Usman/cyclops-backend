import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProjectModule } from '../project/project.module';
import { ProposalController } from './proposal.controller';
import { Proposal } from './proposal.entity';
import { ProposalService } from './proposal.service';

@Module({
  imports: [TypeOrmModule.forFeature([Proposal]), ProjectModule, AuthModule],
  controllers: [ProposalController],
  providers: [ProposalService],
})
export class ProposalModule {}
