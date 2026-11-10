import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Client } from '../client/client.entity';
import { ProjectController } from './project.controller';
import { Project } from './project.entity';
import { ProjectService } from './project.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Client]), AuthModule],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [TypeOrmModule],
})
export class ProjectModule {}
