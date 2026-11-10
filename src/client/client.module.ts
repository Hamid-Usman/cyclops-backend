import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/user.entity';
import { ClientController } from './client.controller';
import { Client } from './client.entity';
import { ClientService } from './client.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client, User]), AuthModule],
  controllers: [ClientController],
  providers: [ClientService],
})
export class ClientModule {}
