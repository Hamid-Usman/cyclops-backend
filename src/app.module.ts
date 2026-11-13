import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateUsers1710000000000 } from './auth/create-users.migration';
import { CreateClients1710000000001 } from './client/create-clients.migration';
import { CreateProjectsAndProposals1710000000002 } from './proposal/create-projects-and-proposals.migration';
import { CreateInvoices1710000000003 } from './invoice/create-invoices.migration';
import { CreateInvoiceLineItems1710000000004 } from './invoice/create-invoice-line-items.migration';
import { AddGoogleSignIn1710000000005 } from './auth/add-google-sign-in.migration';
import { AddInvoicePaymentReports1710000000006 } from './invoice/add-invoice-payment-reports.migration';
import { AddMilestones1710000000007 } from './project/add-milestones.migration';
import { AuthModule } from './auth/auth.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientModule } from './client/client.module';
import { ProjectModule } from './project/project.module';
import { ProposalModule } from './proposal/proposal.module';
import { InvoiceModule } from './invoice/invoice.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AddClientOwners1710000000008 } from './client/add-client-owners.migration';
import { RedisCacheModule } from './cache/redis-cache.module';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'cyclops-backend',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        migrations: [
          CreateUsers1710000000000,
          CreateClients1710000000001,
          CreateProjectsAndProposals1710000000002,
          CreateInvoices1710000000003,
          CreateInvoiceLineItems1710000000004,
          AddGoogleSignIn1710000000005,
          AddInvoicePaymentReports1710000000006,
          AddMilestones1710000000007,
          AddClientOwners1710000000008,
        ],
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    RedisCacheModule,
    AuthModule,
    ClientModule,
    ProjectModule,
    ProposalModule,
    InvoiceModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
