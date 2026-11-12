import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { fromHundredths, toHundredths } from '../common/money';
import { splitByPercent } from '../project/milestone.rules';
import {
  MilestoneKind,
  ProjectMilestone,
} from '../project/project-milestone.entity';
import { Project } from '../project/project.entity';
import { Proposal } from '../proposal/proposal.entity';
import { Invoice, InvoiceLineItem, InvoiceStatus } from './invoice.entity';
import {
  calculateInvoiceTotals,
  calculateLineItems,
  prepareInvoiceForSend,
  toDateOnly,
} from './invoice.rules';

// Shared by the invoice endpoints and by proposal acceptance, which bills the
// agreed payment schedule straight away. Callers run these inside their own
// transaction and hold the locks they need.

/**
 * The next invoice number for an owner. FOR UPDATE makes two concurrent sends
 * by the same owner wait for each other, so they can't take the same number;
 * the unique index is a backstop.
 */
export async function nextInvoiceNumber(
  manager: EntityManager,
  ownerId: string,
): Promise<number> {
  const [{ max }] = (await manager.query(
    'SELECT MAX(`number`) AS `max` FROM `invoices` WHERE `owner_id` = ? FOR UPDATE',
    [ownerId],
  )) as [{ max: number | null }];
  return Number(max ?? 0) + 1;
}

export interface MilestoneBilling {
  ownerId: string;
  project: Pick<Project, 'id' | 'clientId' | 'name'>;
  proposal: Pick<Proposal, 'price' | 'discount' | 'currency' | 'taxRate'>;
  /** The project's whole schedule, in order. */
  schedule: ProjectMilestone[];
}

/**
 * Drafts the invoice for one step of the schedule: that step's share of the
 * agreed price after discount, with the agreed currency and tax rate. The
 * whole price is split over the schedule, so the invoices together add up to
 * exactly that price. Links the invoice to the milestone and returns its id.
 */
export async function draftMilestoneInvoice(
  manager: EntityManager,
  billing: MilestoneBilling,
  milestone: ProjectMilestone,
  now = new Date(),
): Promise<string> {
  const { ownerId, project, proposal, schedule } = billing;
  const shares = splitByPercent(
    toHundredths(proposal.price ?? 0) - toHundredths(proposal.discount),
    schedule.map((step) => step.percent),
  );
  const share = shares[schedule.findIndex((step) => step.id === milestone.id)];

  const { lines, amount } = calculateLineItems([
    {
      description: `${milestone.title}: ${milestone.percent}% of the agreed price`,
      quantity: 1,
      unitPrice: fromHundredths(share),
    },
  ]);
  const id = randomUUID();
  const today = toDateOnly(now);
  await manager.insert(Invoice, {
    id,
    ownerId,
    clientId: project.clientId,
    projectId: project.id,
    number: null,
    status: InvoiceStatus.Draft,
    title: `${milestone.title} - ${project.name}`.slice(0, 200),
    description: milestone.deliverables,
    notes: null,
    currency: proposal.currency,
    amount,
    taxRate: proposal.taxRate,
    ...calculateInvoiceTotals({ amount, taxRate: proposal.taxRate }),
    // A due date already past would block sending; the default applies.
    dueDate:
      milestone.dueDate && milestone.dueDate >= today
        ? milestone.dueDate
        : null,
  });
  await manager.insert(
    InvoiceLineItem,
    lines.map((line) => ({ id: randomUUID(), invoiceId: id, ...line })),
  );
  await manager.update(
    ProjectMilestone,
    { id: milestone.id },
    { invoiceId: id },
  );
  return id;
}

/**
 * Bills a newly agreed schedule: a draft invoice for every step, and the
 * deposit, which is owed on acceptance, sent right away.
 */
export async function invoiceSchedule(
  manager: EntityManager,
  billing: MilestoneBilling,
  now = new Date(),
): Promise<void> {
  for (const milestone of billing.schedule) {
    if (milestone.invoiceId) {
      continue;
    }
    const invoiceId = await draftMilestoneInvoice(
      manager,
      billing,
      milestone,
      now,
    );
    if (milestone.kind === MilestoneKind.Deposit) {
      const changes = prepareInvoiceForSend(
        {
          status: InvoiceStatus.Draft,
          // The deposit is a share of a positive total, so never 0 here.
          amount: 1,
          dueDate: null,
        },
        now,
      );
      await manager.update(
        Invoice,
        { id: invoiceId },
        {
          ...changes,
          number: await nextInvoiceNumber(manager, billing.ownerId),
        },
      );
    }
  }
}
