import type { Router } from "express";
import { getSupabaseServiceRole } from "../../infra/supabaseClient.js";

// Adapters out
import { SupabaseBankStatementImportRepository } from "./adapters/out/supabase-bank-statement-import.repository.js";
import { SupabaseBankMovementRepository } from "./adapters/out/supabase-bank-movement.repository.js";
import { SupabaseBankReconciliationRuleRepository } from "./adapters/out/supabase-bank-reconciliation-rule.repository.js";
import { SupabaseInvoiceMatchReadAdapter } from "./adapters/out/supabase-invoice-match-read.adapter.js";
import { SupabasePayableEntryMatchReadAdapter } from "./adapters/out/supabase-payable-entry-match-read.adapter.js";
import { SupabaseMovementMatchHintAdapter } from "./adapters/out/supabase-movement-match-hint.adapter.js";
import { SupabaseBankMovementEntityLinkRepository } from "./adapters/out/supabase-bank-movement-entity-link.repository.js";
import { SupabaseBankAccountReadAdapter } from "./adapters/out/supabase-bank-account-read.adapter.js";
import { SupabaseInvoiceReconciliationWriteAdapter } from "./adapters/out/supabase-invoice-reconciliation-write.adapter.js";

// Use cases
import { ImportBankStatementUseCase } from "./application/use-cases/import-bank-statement.use-case.js";
import { ListBankStatementsUseCase } from "./application/use-cases/list-bank-statements.use-case.js";
import { GetBankStatementUseCase } from "./application/use-cases/get-bank-statement.use-case.js";
import { ReconcileMovementUseCase } from "./application/use-cases/reconcile-movement.use-case.js";
import { ClassifyMovementUseCase } from "./application/use-cases/classify-movement.use-case.js";
import { ApplyAutoRulesUseCase } from "./application/use-cases/apply-auto-rules.use-case.js";
import { SuggestMatchesUseCase } from "./application/use-cases/suggest-matches.use-case.js";
import { CreateReconciliationRuleUseCase } from "./application/use-cases/create-reconciliation-rule.use-case.js";
import { ListReconciliationRulesUseCase } from "./application/use-cases/list-reconciliation-rules.use-case.js";
import { DeleteReconciliationRuleUseCase } from "./application/use-cases/delete-reconciliation-rule.use-case.js";
import { CloseStatementUseCase } from "./application/use-cases/close-statement.use-case.js";
import { DeleteBankStatementUseCase } from "./application/use-cases/delete-bank-statement.use-case.js";
import { UpdateStatementBalancesUseCase } from "./application/use-cases/update-statement-balances.use-case.js";
import { FindMovementCandidatesUseCase } from "./application/use-cases/find-movement-candidates.use-case.js";
import { UploadMovementDocumentUseCase } from "./application/use-cases/upload-movement-document.use-case.js";
import { LinkStatementToAccountUseCase } from "./application/use-cases/link-statement-to-account.use-case.js";
import { GetAccountCalendarUseCase } from "./application/use-cases/get-account-calendar.use-case.js";
import { GetAccountMonthDetailUseCase } from "./application/use-cases/get-account-month-detail.use-case.js";
import { GetMovementsLinkedToInvoiceUseCase } from "./application/use-cases/get-movements-linked-to-invoice.use-case.js";
import { GetInvoiceOpenBalancesUseCase } from "./application/use-cases/get-invoice-open-balances.use-case.js";
import { UnreconcileMovementUseCase } from "./application/use-cases/unreconcile-movement.use-case.js";
import { SupabaseBankDocumentStorageAdapter } from "./adapters/out/supabase-bank-document-storage.adapter.js";

// Adapter in
import { BankStatementController } from "./adapters/in/bank-statement.controller.js";

// Cross-module port
import type { BankAccountReadPort } from "./domain/ports/out/bank-account-read.port.js";

/**
 * Composition root for the bank-statements module.
 *
 * Accepts an optional bankAccountRead port (injected from bank-accounts module)
 * to enable automatic account linking on import.
 */
export function createBankStatementsModule(bankAccountRead?: BankAccountReadPort): { router: Router } {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role client is not configured");

  // Adapters out
  const statementRepo = new SupabaseBankStatementImportRepository(supabase);
  const movementRepo = new SupabaseBankMovementRepository(supabase);
  const ruleRepo = new SupabaseBankReconciliationRuleRepository(supabase);
  const invoiceRead = new SupabaseInvoiceMatchReadAdapter(supabase);
  const payableRead = new SupabasePayableEntryMatchReadAdapter(supabase);
  const movementHint = new SupabaseMovementMatchHintAdapter(supabase);
  const entityLinkRepo = new SupabaseBankMovementEntityLinkRepository(supabase);
  const invoiceReconciliationWrite = new SupabaseInvoiceReconciliationWriteAdapter(supabase);

  // Cross-module: fall back to direct Supabase adapter if not injected
  const resolvedBankAccountRead: BankAccountReadPort =
    bankAccountRead ?? new SupabaseBankAccountReadAdapter(supabase);

  // Use cases
  const importStatement = new ImportBankStatementUseCase(statementRepo, movementRepo, resolvedBankAccountRead);
  const listStatements = new ListBankStatementsUseCase(statementRepo);
  const getStatement = new GetBankStatementUseCase(statementRepo, movementRepo, entityLinkRepo);
  const reconcileMovement = new ReconcileMovementUseCase(movementRepo, movementHint, invoiceRead, payableRead, entityLinkRepo, invoiceReconciliationWrite);
  const classifyMovement = new ClassifyMovementUseCase(movementRepo);
  const applyAutoRules = new ApplyAutoRulesUseCase(statementRepo, movementRepo, ruleRepo);
  const suggestMatches = new SuggestMatchesUseCase(
    statementRepo,
    movementRepo,
    invoiceRead,
    payableRead,
    movementHint,
  );
  const createRule = new CreateReconciliationRuleUseCase(ruleRepo);
  const listRules = new ListReconciliationRulesUseCase(ruleRepo);
  const deleteRule = new DeleteReconciliationRuleUseCase(ruleRepo);
  const closeStatement = new CloseStatementUseCase(statementRepo, movementRepo);
  const deleteStatement = new DeleteBankStatementUseCase(statementRepo);
  const updateBalances = new UpdateStatementBalancesUseCase(statementRepo);
  const findMovementCandidates = new FindMovementCandidatesUseCase(movementRepo, invoiceRead, payableRead, movementHint, entityLinkRepo);
  const documentStorage = new SupabaseBankDocumentStorageAdapter(supabase);
  const uploadMovementDocument = new UploadMovementDocumentUseCase(movementRepo, documentStorage);
  const linkStatementToAccount = new LinkStatementToAccountUseCase(statementRepo, resolvedBankAccountRead);
  const getAccountCalendar = new GetAccountCalendarUseCase(movementRepo);
  const getAccountMonthDetail = new GetAccountMonthDetailUseCase(movementRepo, entityLinkRepo);
  const getMovementsLinkedToInvoice = new GetMovementsLinkedToInvoiceUseCase(entityLinkRepo, movementRepo);
  const getInvoiceOpenBalances = new GetInvoiceOpenBalancesUseCase(entityLinkRepo, invoiceRead);
  const unreconcileMovement = new UnreconcileMovementUseCase(movementRepo, entityLinkRepo, invoiceRead, invoiceReconciliationWrite);

  // Adapter in
  const controller = new BankStatementController(
    importStatement,
    listStatements,
    getStatement,
    reconcileMovement,
    classifyMovement,
    applyAutoRules,
    suggestMatches,
    createRule,
    listRules,
    deleteRule,
    closeStatement,
    deleteStatement,
    updateBalances,
    findMovementCandidates,
    uploadMovementDocument,
    linkStatementToAccount,
    getAccountCalendar,
    getAccountMonthDetail,
    getMovementsLinkedToInvoice,
    getInvoiceOpenBalances,
    unreconcileMovement,
  );

  return { router: controller.router };
}
