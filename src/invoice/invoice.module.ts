import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProjectModule } from '../project/project.module';
import { InvoiceController } from './invoice.controller';
import { Invoice } from './invoice.entity';
import { InvoiceService } from './invoice.service';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice]), ProjectModule, AuthModule],
  controllers: [InvoiceController],
  providers: [InvoiceService],
})
export class InvoiceModule {}
