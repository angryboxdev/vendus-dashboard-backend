import type { SupabaseClient } from "@supabase/supabase-js";
import type { Router } from "express";
import { getSupabaseServiceRole } from "../../infra/scoped-db/supabase-client.js";
import { SupabasePayableEntryRepository } from "./adapters/out/supabase-payable-entry.repository.js";
import { SupabaseInvoiceReadAdapter } from "./adapters/out/supabase-invoice-read.adapter.js";
import { CreatePayableEntryUseCase } from "./application/use-cases/create-payable-entry.use-case.js";
import { UpdatePayableEntryUseCase } from "./application/use-cases/update-payable-entry.use-case.js";
import { MarkPayableAsPaidUseCase } from "./application/use-cases/mark-payable-as-paid.use-case.js";
import { CancelPayableEntryUseCase } from "./application/use-cases/cancel-payable-entry.use-case.js";
import { ListPayableEntriesUseCase } from "./application/use-cases/list-payable-entries.use-case.js";
import { GetPayableEntryUseCase } from "./application/use-cases/get-payable-entry.use-case.js";
import { DeletePayableEntryUseCase } from "./application/use-cases/delete-payable-entry.use-case.js";
import { GetPayableSummaryUseCase } from "./application/use-cases/get-payable-summary.use-case.js";
import { GetPayableCalendarUseCase } from "./application/use-cases/get-payable-calendar.use-case.js";
import { createPayableEntryRouter } from "./adapters/in/payable-entry.controller.js";

export interface PayableEntriesModule {
  router: Router;
}

/**
 * Composition root do módulo payable-entries.
 *
 * Único lugar que conhece as implementações concretas dos adapters.
 * Todos os use cases e o domínio operam apenas contra interfaces (ports).
 */
export function createPayableEntriesModule(supabase?: SupabaseClient): PayableEntriesModule {
  const client = supabase ?? getSupabaseServiceRole();
  if (!client) throw new Error("Supabase service role não configurado");

  // Adapters de saída
  const payableRepo = new SupabasePayableEntryRepository(client);
  const invoiceRead = new SupabaseInvoiceReadAdapter(client);

  // Use cases
  const router = createPayableEntryRouter({
    createPayableEntry: new CreatePayableEntryUseCase(payableRepo),
    updatePayableEntry: new UpdatePayableEntryUseCase(payableRepo),
    markPayableAsPaid: new MarkPayableAsPaidUseCase(payableRepo, invoiceRead),
    cancelPayableEntry: new CancelPayableEntryUseCase(payableRepo),
    listPayableEntries: new ListPayableEntriesUseCase(payableRepo),
    getPayableEntry: new GetPayableEntryUseCase(payableRepo),
    deletePayableEntry: new DeletePayableEntryUseCase(payableRepo),
    getPayableSummary: new GetPayableSummaryUseCase(payableRepo),
    getPayableCalendar: new GetPayableCalendarUseCase(payableRepo),
  });

  return { router };
}
