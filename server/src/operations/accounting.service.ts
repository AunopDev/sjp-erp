import { Injectable } from '@nestjs/common';
import type { SafeUser } from '../auth/user.types.js';
import { AccessService } from '../common/access.service.js';
import { todayStr } from '../common/dates.js';
import { RecordsService } from '../records/records.service.js';

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class AccountingService {
  constructor(
    private readonly records: RecordsService,
    private readonly access: AccessService,
  ) {}

  summary(user: SafeUser) {
    if (!this.access.can(user, 'accounting', 'view')) return null;
    const today = todayStr();
    const month = today.slice(0, 7);

    const invoices = this.records.all(user, 'invoices');
    const receipts = this.records.all(user, 'receipts');
    const paidByInvoice = new Map<string, number>();
    for (const receipt of receipts) {
      const invoiceId = String(receipt['invoice'] ?? '');
      if (!invoiceId) continue;
      paidByInvoice.set(invoiceId, (paidByInvoice.get(invoiceId) ?? 0) + num(receipt['amount']));
    }
    const remaining = (row: Record<string, unknown>) =>
      Math.max(0, num(row['total']) - (paidByInvoice.get(String(row.id)) ?? 0));
    const openInvoices = invoices.filter(
      (row) => !['paid', 'cancelled'].includes(String(row['status'] ?? '')) && remaining(row) > 0,
    );
    const overdue = openInvoices.filter((row) => String(row['dueDate'] ?? '') && String(row['dueDate']) < today);
    const dueSoon = openInvoices.filter(
      (row) => String(row['dueDate'] ?? '') >= today && String(row['dueDate'] ?? '') <= this.addDays(today, 7),
    );

    const receiptsThisMonth = receipts.filter((row) => String(row['paidDate'] ?? '').startsWith(month));

    const expenses = this.records.all(user, 'expenses');
    const expensesThisMonth = expenses.filter((row) => String(row['date'] ?? '').startsWith(month));
    const pendingExpenses = expenses.filter((row) => ['draft', 'submitted'].includes(String(row['status'] ?? '')));

    return {
      invoices: {
        open: openInvoices.length,
        outstanding: openInvoices.reduce((sum, row) => sum + remaining(row), 0),
        overdue: overdue.length,
        overdueAmount: overdue.reduce((sum, row) => sum + remaining(row), 0),
        dueSoon: dueSoon.length,
      },
      receipts: {
        count: receiptsThisMonth.length,
        month: receiptsThisMonth.reduce((sum, row) => sum + num(row['amount']), 0),
      },
      expenses: {
        month: expensesThisMonth.reduce((sum, row) => sum + num(row['amount']), 0),
        pending: pendingExpenses.length,
        pendingAmount: pendingExpenses.reduce((sum, row) => sum + num(row['amount']), 0),
      },
    };
  }

  private addDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }
}
