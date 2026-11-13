import { CreateUsers1710000000000 } from '../auth/create-users.migration';
import { AddGoogleSignIn1710000000005 } from '../auth/add-google-sign-in.migration';
import { CreateClients1710000000001 } from '../client/create-clients.migration';
import { AddClientOwners1710000000008 } from '../client/add-client-owners.migration';
import { CreateInvoices1710000000003 } from '../invoice/create-invoices.migration';
import { CreateInvoiceLineItems1710000000004 } from '../invoice/create-invoice-line-items.migration';
import { AddInvoicePaymentReports1710000000006 } from '../invoice/add-invoice-payment-reports.migration';
import { AddMilestones1710000000007 } from '../project/add-milestones.migration';
import { CreateProjectsAndProposals1710000000002 } from '../proposal/create-projects-and-proposals.migration';
import { AddListIndexes1710000000009 } from './add-list-indexes.migration';

// Every migration, in the order they run. The app runs pending ones on start.
export const MIGRATIONS = [
  CreateUsers1710000000000,
  CreateClients1710000000001,
  CreateProjectsAndProposals1710000000002,
  CreateInvoices1710000000003,
  CreateInvoiceLineItems1710000000004,
  AddGoogleSignIn1710000000005,
  AddInvoicePaymentReports1710000000006,
  AddMilestones1710000000007,
  AddClientOwners1710000000008,
  AddListIndexes1710000000009,
];
