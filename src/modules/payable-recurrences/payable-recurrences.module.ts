import type { GetRecurrenceForBankRulePort, ReopenOccurrenceFromBankPort, SettleOccurrenceFromBankPort, SettleRecurrenceFromBankPort } from "./domain/ports/in/bank-payment.ports.js";
import { GetRecurrenceForBankRuleUseCase, ReopenOccurrenceFromBankUseCase, SettleOccurrenceFromBankUseCase, SettleRecurrenceFromBankUseCase } from "./application/use-cases/occurrence-bank-payment.use-cases.js";
import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";

// Adapters out
import { SupabaseRecurrenceRepository } from "./adapters/out/supabase-recurrence.repository.js";
import { SupabaseOccurrenceRepository } from "./adapters/out/supabase-occurrence.repository.js";
import { SupabaseInvoiceReadAdapter } from "./adapters/out/supabase-invoice-read.adapter.js";
import { SupabaseRecurrenceDocumentStorageAdapter } from "./adapters/out/supabase-document-storage.adapter.js";
import { SupabaseBankMovementLinkReadAdapter } from "./adapters/out/supabase-bank-movement-link-read.adapter.js";
import { SupabaseInvoiceAllocatedAmountReadAdapter } from "./adapters/out/supabase-invoice-allocated-amount-read.adapter.js";
import { SupabaseEmployeeDirectoryReadAdapter } from "./adapters/out/supabase-employee-directory-read.adapter.js";

// Use cases — recorrências
import { CreateRecurrenceUseCase } from "./application/use-cases/create-recurrence.use-case.js";
import { UpdateRecurrenceUseCase } from "./application/use-cases/update-recurrence.use-case.js";
import { PauseRecurrenceUseCase } from "./application/use-cases/pause-recurrence.use-case.js";
import { ResumeRecurrenceUseCase } from "./application/use-cases/resume-recurrence.use-case.js";
import { CloseRecurrenceUseCase } from "./application/use-cases/close-recurrence.use-case.js";
import { ListRecurrencesUseCase } from "./application/use-cases/list-recurrences.use-case.js";
import { GetRecurrenceUseCase } from "./application/use-cases/get-recurrence.use-case.js";
import { ListRecurrenceEmployeesUseCase } from "./application/use-cases/list-recurrence-employees.use-case.js";

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
import { GetMonthlySummaryUseCase } from "./application/use-cases/get-monthly-summary.use-case.js";
import { ListOccurrencesForPeriodUseCase } from "./application/use-cases/list-occurrences-for-period.use-case.js";

// Use cases — fatura ↔ recorrência
import { LinkInvoiceToRecurrenceUseCase } from "./application/use-cases/link-invoice-to-recurrence.use-case.js";
import { AutoLinkInvoiceUseCase } from "./application/use-cases/auto-link-invoice.use-case.js";
import { GetInvoiceRecurrenceStatusUseCase } from "./application/use-cases/get-invoice-recurrence-status.use-case.js";
import { UnlinkInvoiceFromOccurrenceUseCase } from "./application/use-cases/unlink-invoice-from-occurrence.use-case.js";
import { ReleaseInvoiceLinksUseCase } from "./application/use-cases/release-invoice-links.use-case.js";
import type { AutoLinkInvoicePort, ReleaseInvoiceLinksPort } from "./domain/ports/in/invoice-link.ports.js";

// Adapter in
import { createRecurrenceRouter } from "./adapters/in/recurrence.controller.js";

export interface PayableRecurrencesModule {
  router: Router;
  /** Para o módulo invoices (ligado em server.ts): associar uma fatura lançada. */
  autoLinkInvoice: AutoLinkInvoicePort;
  /** Para o módulo invoices: fatura apagada → desfaz associações não pagas. */
  releaseInvoiceLinks: ReleaseInvoiceLinksPort;
  /** Para o módulo bank-statements: movimento ligado a uma ocorrência → paga; desconciliado → reabre. */
  settleOccurrenceFromBank: SettleOccurrenceFromBankPort;
  reopenOccurrenceFromBank: ReopenOccurrenceFromBankPort;
  /** Para o módulo bank-statements: «movimento recorrente» ligado a uma recorrência → paga a ocorrência do mês. */
  settleRecurrenceFromBank: SettleRecurrenceFromBankPort;
  getRecurrenceForBankRule: GetRecurrenceForBankRulePort;
}

/**
 * Composition root do módulo payable-recurrences (spec B2 ticket 06; ver a
 * secção Ports do README do módulo, e o padrão estabelecido em bank-accounts,
 * spec B2 ticket 02).
 *
 * Único lugar que conhece as implementações concretas dos adapters. Seguindo
 * D2, os adapters não constroem o seu próprio `ScopedQuery`: recebem o
 * factory `createScopedQuery` injectado aqui e constroem um helper escopado
 * por chamada. Todos os use cases e o domínio operam apenas contra
 * interfaces (ports).
 */
export function createPayableRecurrencesModule(): PayableRecurrencesModule {
  // Adapters de saída
  const recurrenceRepo = new SupabaseRecurrenceRepository(createScopedQuery);
  const occurrenceRepo = new SupabaseOccurrenceRepository(createScopedQuery);
  const invoiceRead = new SupabaseInvoiceReadAdapter(createScopedQuery);
  const documentStorage = new SupabaseRecurrenceDocumentStorageAdapter();
  const bankMovementLinkRead = new SupabaseBankMovementLinkReadAdapter(createScopedQuery);
  const invoiceAllocatedAmountRead = new SupabaseInvoiceAllocatedAmountReadAdapter(createScopedQuery);
  const employeeDirectory = new SupabaseEmployeeDirectoryReadAdapter(createScopedQuery);

  // Fatura ↔ recorrência
  const linkInvoiceToOccurrence = new LinkInvoiceToOccurrenceUseCase(occurrenceRepo, invoiceRead);
  const linkInvoiceToRecurrence = new LinkInvoiceToRecurrenceUseCase(recurrenceRepo, occurrenceRepo, linkInvoiceToOccurrence);
  const autoLinkInvoice = new AutoLinkInvoiceUseCase(recurrenceRepo, occurrenceRepo, invoiceRead, linkInvoiceToRecurrence);
  const releaseInvoiceLinks = new ReleaseInvoiceLinksUseCase(occurrenceRepo, invoiceRead);

  // Controller
  const router = createRecurrenceRouter({
    // Recorrências
    createRecurrence: new CreateRecurrenceUseCase(recurrenceRepo, employeeDirectory),
    updateRecurrence: new UpdateRecurrenceUseCase(recurrenceRepo, employeeDirectory),
    pauseRecurrence: new PauseRecurrenceUseCase(recurrenceRepo),
    resumeRecurrence: new ResumeRecurrenceUseCase(recurrenceRepo),
    closeRecurrence: new CloseRecurrenceUseCase(recurrenceRepo),
    listRecurrences: new ListRecurrencesUseCase(recurrenceRepo),
    getRecurrence: new GetRecurrenceUseCase(recurrenceRepo),
    listRecurrenceEmployees: new ListRecurrenceEmployeesUseCase(employeeDirectory),
    // Ocorrências
    generateOccurrence: new GenerateOccurrenceUseCase(recurrenceRepo, occurrenceRepo),
    listOccurrences: new ListOccurrencesUseCase(occurrenceRepo, bankMovementLinkRead, invoiceAllocatedAmountRead, invoiceRead),
    getOccurrence: new GetOccurrenceUseCase(occurrenceRepo, bankMovementLinkRead, invoiceAllocatedAmountRead, invoiceRead),
    linkInvoiceToOccurrence,
    markOccurrenceAsPaid: new MarkOccurrenceAsPaidUseCase(occurrenceRepo),
    cancelOccurrence: new CancelOccurrenceUseCase(occurrenceRepo),
    getLinkedInvoiceIds: new GetLinkedInvoiceIdsUseCase(occurrenceRepo, invoiceRead),
    // Batch
    generateBatch: new GenerateBatchOccurrencesUseCase(recurrenceRepo, occurrenceRepo),
    // Documentos
    uploadRecurrenceDocument: new UploadRecurrenceDocumentUseCase(recurrenceRepo, documentStorage),
    deleteRecurrenceDocument: new DeleteRecurrenceDocumentUseCase(recurrenceRepo, documentStorage),
    uploadOccurrenceDocument: new UploadOccurrenceDocumentUseCase(occurrenceRepo, documentStorage),
    deleteOccurrenceDocument: new DeleteOccurrenceDocumentUseCase(occurrenceRepo, documentStorage),
    getRecurrenceSummary: new GetRecurrenceSummaryUseCase(occurrenceRepo),
    getMonthlySummary: new GetMonthlySummaryUseCase(
      recurrenceRepo,
      occurrenceRepo,
      bankMovementLinkRead,
      invoiceAllocatedAmountRead,
      invoiceRead,
    ),
    listOccurrencesForPeriod: new ListOccurrencesForPeriodUseCase(
      recurrenceRepo,
      occurrenceRepo,
      bankMovementLinkRead,
      invoiceAllocatedAmountRead,
      invoiceRead,
    ),
    getInvoiceRecurrenceStatus: new GetInvoiceRecurrenceStatusUseCase(recurrenceRepo, occurrenceRepo, invoiceRead),
    linkInvoiceToRecurrence,
    unlinkInvoiceFromOccurrence: new UnlinkInvoiceFromOccurrenceUseCase(occurrenceRepo),
  });

  return {
    router,
    autoLinkInvoice,
    releaseInvoiceLinks,
    settleOccurrenceFromBank: new SettleOccurrenceFromBankUseCase(occurrenceRepo),
    reopenOccurrenceFromBank: new ReopenOccurrenceFromBankUseCase(occurrenceRepo),
    settleRecurrenceFromBank: new SettleRecurrenceFromBankUseCase(recurrenceRepo, occurrenceRepo, bankMovementLinkRead),
    getRecurrenceForBankRule: new GetRecurrenceForBankRuleUseCase(recurrenceRepo),
  };
}
