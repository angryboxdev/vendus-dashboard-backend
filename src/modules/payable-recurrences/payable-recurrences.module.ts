import type { SupabaseClient } from "@supabase/supabase-js";
import type { Router } from "express";
import { getSupabaseServiceRole } from "../../infra/supabaseClient.js";

// Adapters out
import { SupabaseRecurrenceRepository } from "./adapters/out/supabase-recurrence.repository.js";
import { SupabaseOccurrenceRepository } from "./adapters/out/supabase-occurrence.repository.js";
import { SupabaseInvoiceReadAdapter } from "./adapters/out/supabase-invoice-read.adapter.js";
import { SupabaseRecurrenceDocumentStorageAdapter } from "./adapters/out/supabase-document-storage.adapter.js";
import { SupabaseBankMovementLinkReadAdapter } from "./adapters/out/supabase-bank-movement-link-read.adapter.js";

// Use cases — recorrências
import { CreateRecurrenceUseCase } from "./application/use-cases/create-recurrence.use-case.js";
import { UpdateRecurrenceUseCase } from "./application/use-cases/update-recurrence.use-case.js";
import { PauseRecurrenceUseCase } from "./application/use-cases/pause-recurrence.use-case.js";
import { ResumeRecurrenceUseCase } from "./application/use-cases/resume-recurrence.use-case.js";
import { CloseRecurrenceUseCase } from "./application/use-cases/close-recurrence.use-case.js";
import { ListRecurrencesUseCase } from "./application/use-cases/list-recurrences.use-case.js";
import { GetRecurrenceUseCase } from "./application/use-cases/get-recurrence.use-case.js";

// Use cases — ocorrências
import { GenerateOccurrenceUseCase } from "./application/use-cases/generate-occurrence.use-case.js";
import { ListOccurrencesUseCase } from "./application/use-cases/list-occurrences.use-case.js";
import { GetOccurrenceUseCase } from "./application/use-cases/get-occurrence.use-case.js";
import { LinkInvoiceToOccurrenceUseCase } from "./application/use-cases/link-invoice-to-occurrence.use-case.js";
import { MarkOccurrenceAsPaidUseCase } from "./application/use-cases/mark-occurrence-as-paid.use-case.js";
import { CancelOccurrenceUseCase } from "./application/use-cases/cancel-occurrence.use-case.js";
import { GetLinkedInvoiceIdsUseCase } from "./application/use-cases/get-linked-invoice-ids.use-case.js";

// Use cases — batch e documentos
import { GenerateBatchOccurrencesUseCase } from "./application/use-cases/generate-batch-occurrences.use-case.js";
import { UploadRecurrenceDocumentUseCase } from "./application/use-cases/upload-recurrence-document.use-case.js";
import { DeleteRecurrenceDocumentUseCase } from "./application/use-cases/delete-recurrence-document.use-case.js";
import { UploadOccurrenceDocumentUseCase } from "./application/use-cases/upload-occurrence-document.use-case.js";
import { DeleteOccurrenceDocumentUseCase } from "./application/use-cases/delete-occurrence-document.use-case.js";
import { GetRecurrenceSummaryUseCase } from "./application/use-cases/get-summary.use-case.js";

// Adapter in
import { createRecurrenceRouter } from "./adapters/in/recurrence.controller.js";

export interface PayableRecurrencesModule {
  router: Router;
}

/**
 * Composition root do módulo payable-recurrences.
 *
 * Único lugar que conhece as implementações concretas dos adapters.
 * Todos os use cases e o domínio operam apenas contra interfaces (ports).
 */
export function createPayableRecurrencesModule(supabase?: SupabaseClient): PayableRecurrencesModule {
  const client = supabase ?? getSupabaseServiceRole();
  if (!client) throw new Error("Supabase service role não configurado");

  // Adapters de saída
  const recurrenceRepo = new SupabaseRecurrenceRepository(client);
  const occurrenceRepo = new SupabaseOccurrenceRepository(client);
  const invoiceRead = new SupabaseInvoiceReadAdapter(client);
  const documentStorage = new SupabaseRecurrenceDocumentStorageAdapter(client);
  const bankMovementLinkRead = new SupabaseBankMovementLinkReadAdapter(client);

  // Controller
  const router = createRecurrenceRouter({
    // Recorrências
    createRecurrence: new CreateRecurrenceUseCase(recurrenceRepo),
    updateRecurrence: new UpdateRecurrenceUseCase(recurrenceRepo),
    pauseRecurrence: new PauseRecurrenceUseCase(recurrenceRepo),
    resumeRecurrence: new ResumeRecurrenceUseCase(recurrenceRepo),
    closeRecurrence: new CloseRecurrenceUseCase(recurrenceRepo),
    listRecurrences: new ListRecurrencesUseCase(recurrenceRepo),
    getRecurrence: new GetRecurrenceUseCase(recurrenceRepo),
    // Ocorrências
    generateOccurrence: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
    listOccurrences: new ListOccurrencesUseCase(occurrenceRepo, bankMovementLinkRead),
    getOccurrence: new GetOccurrenceUseCase(occurrenceRepo, bankMovementLinkRead),
    linkInvoiceToOccurrence: new LinkInvoiceToOccurrenceUseCase(occurrenceRepo, invoiceRead),
    markOccurrenceAsPaid: new MarkOccurrenceAsPaidUseCase(occurrenceRepo),
    cancelOccurrence: new CancelOccurrenceUseCase(occurrenceRepo),
    getLinkedInvoiceIds: new GetLinkedInvoiceIdsUseCase(occurrenceRepo),
    // Batch
    generateBatch: new GenerateBatchOccurrencesUseCase(recurrenceRepo, occurrenceRepo),
    // Documentos
    uploadRecurrenceDocument: new UploadRecurrenceDocumentUseCase(recurrenceRepo, documentStorage),
    deleteRecurrenceDocument: new DeleteRecurrenceDocumentUseCase(recurrenceRepo, documentStorage),
    uploadOccurrenceDocument: new UploadOccurrenceDocumentUseCase(occurrenceRepo, documentStorage),
    deleteOccurrenceDocument: new DeleteOccurrenceDocumentUseCase(occurrenceRepo, documentStorage),
    getRecurrenceSummary: new GetRecurrenceSummaryUseCase(occurrenceRepo),
  });

  return { router };
}
