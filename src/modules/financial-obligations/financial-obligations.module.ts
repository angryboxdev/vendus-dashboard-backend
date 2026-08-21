import type { SupabaseClient } from "@supabase/supabase-js";
import type { Router } from "express";
import { getSupabaseServiceRole } from "../../infra/supabaseClient.js";
import { SupabaseObligationRepository } from "./adapters/out/supabase-obligation.repository.js";
import { SupabaseOccurrenceSyncAdapter } from "./adapters/out/supabase-occurrence-sync.adapter.js";
import { SupabaseInvoiceMarkPaidAdapter } from "./adapters/out/supabase-invoice-mark-paid.adapter.js";
import { ListObligationsUseCase } from "./application/use-cases/list-obligations.use-case.js";
import { CreateManualObligationUseCase } from "./application/use-cases/create-manual-obligation.use-case.js";
import { MarkObligationAsPaidUseCase } from "./application/use-cases/mark-obligation-as-paid.use-case.js";
import { createFinancialObligationRouter } from "./adapters/in/financial-obligation.controller.js";

export interface FinancialObligationsModule {
  router: Router;
}

/**
 * Composition root do módulo financial-obligations.
 *
 * Único lugar que conhece as implementações concretas dos adapters.
 * Use cases e domínio operam apenas contra interfaces (ports).
 */
export function createFinancialObligationsModule(supabase?: SupabaseClient): FinancialObligationsModule {
  const client = supabase ?? getSupabaseServiceRole();
  if (!client) throw new Error("Supabase service role não configurado");

  // Adapters de saída
  const obligationRepo = new SupabaseObligationRepository(client);
  const occurrenceSync = new SupabaseOccurrenceSyncAdapter(client);
  const invoiceMarkPaid = new SupabaseInvoiceMarkPaidAdapter(client);

  // Use cases
  const router = createFinancialObligationRouter({
    listObligations: new ListObligationsUseCase(obligationRepo),
    createManualObligation: new CreateManualObligationUseCase(obligationRepo),
    markObligationAsPaid: new MarkObligationAsPaidUseCase(obligationRepo, occurrenceSync, invoiceMarkPaid),
  });

  return { router };
}
