import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRole } from "../../infra/supabaseClient.js";
import { SupabaseInvoiceRepository } from "./adapters/out/supabase-invoice.repository.js";
import { SupabaseInvoiceLineRepository } from "./adapters/out/supabase-invoice-line.repository.js";
import { SupabaseClassificationRuleRepository } from "./adapters/out/supabase-classification-rule.repository.js";
import { SupabasePayableEntryWriteAdapter } from "./adapters/out/supabase-payable-entry-write.adapter.js";
import { CreateInvoiceUseCase } from "./application/use-cases/create-invoice.use-case.js";
import { UpdateInvoiceUseCase } from "./application/use-cases/update-invoice.use-case.js";
import { MarkInvoicePaidUseCase } from "./application/use-cases/mark-invoice-paid.use-case.js";
import { SetInvoiceStatusUseCase } from "./application/use-cases/set-invoice-status.use-case.js";
import { ClassifyInvoiceLineUseCase } from "./application/use-cases/classify-invoice-line.use-case.js";
import { SuggestLineClassificationUseCase } from "./application/use-cases/suggest-line-classification.use-case.js";
import { ListInvoicesUseCase } from "./application/use-cases/list-invoices.use-case.js";
import { GetInvoiceUseCase } from "./application/use-cases/get-invoice.use-case.js";
import { DeleteInvoiceUseCase } from "./application/use-cases/delete-invoice.use-case.js";
import { createInvoiceRouter } from "./adapters/in/invoice.controller.js";
import type { Router } from "express";

export interface InvoicesModule {
  router: Router;
}

export function createInvoicesModule(supabase?: SupabaseClient): InvoicesModule {
  const client = supabase ?? getSupabaseServiceRole();
  if (!client) throw new Error("Supabase service role não configurado");

  const invoiceRepo = new SupabaseInvoiceRepository(client);
  const lineRepo = new SupabaseInvoiceLineRepository(client);
  const ruleRepo = new SupabaseClassificationRuleRepository(client);
  const payableWrite = new SupabasePayableEntryWriteAdapter(client);

  const router = createInvoiceRouter({
    createInvoice: new CreateInvoiceUseCase(invoiceRepo, lineRepo, payableWrite),
    updateInvoice: new UpdateInvoiceUseCase(invoiceRepo),
    markInvoicePaid: new MarkInvoicePaidUseCase(invoiceRepo, payableWrite),
    setInvoiceStatus: new SetInvoiceStatusUseCase(invoiceRepo, payableWrite),
    classifyInvoiceLine: new ClassifyInvoiceLineUseCase(invoiceRepo, lineRepo, ruleRepo),
    listInvoices: new ListInvoicesUseCase(invoiceRepo),
    getInvoice: new GetInvoiceUseCase(invoiceRepo, lineRepo),
    deleteInvoice: new DeleteInvoiceUseCase(invoiceRepo, lineRepo),
    suggestLineClassification: new SuggestLineClassificationUseCase(ruleRepo),
  });

  return { router };
}
