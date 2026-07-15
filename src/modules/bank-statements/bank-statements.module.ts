import type { Router } from "express";
import { getSupabaseServiceRole } from "../../infra/supabaseClient.js";

// Adapters out
import { SupabaseBankStatementImportRepository } from "./adapters/out/supabase-bank-statement-import.repository.js";
import { SupabaseBankMovementRepository } from "./adapters/out/supabase-bank-movement.repository.js";
import { SupabaseBankReconciliationRuleRepository } from "./adapters/out/supabase-bank-reconciliation-rule.repository.js";
import { SupabaseInvoiceMatchReadAdapter } from "./adapters/out/supabase-invoice-match-read.adapter.js";
import { SupabasePayableEntryMatchReadAdapter } from "./adapters/out/supabase-payable-entry-match-read.adapter.js";

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
import { SupabaseBankDocumentStorageAdapter } from "./adapters/out/supabase-bank-document-storage.adapter.js";

// Adapter in
import { BankStatementController } from "./adapters/in/bank-statement.controller.js";

/**
 * Composition root for the bank-statements module.
 *
 * This is the ONLY place that knows about concrete adapter implementations.
 * All other files in this module (use cases, domain) depend only on interfaces (ports).
 */
export function createBankStatementsModule(): { router: Router } {
  const supabase = getSupabaseServiceRole();

  // Adapters out
  const statementRepo = new SupabaseBankStatementImportRepository(supabase);
  const movementRepo = new SupabaseBankMovementRepository(supabase);
  const ruleRepo = new SupabaseBankReconciliationRuleRepository(supabase);
  const invoiceRead = new SupabaseInvoiceMatchReadAdapter(supabase);
  const payableRead = new SupabasePayableEntryMatchReadAdapter(supabase);

  // Use cases
  const importStatement = new ImportBankStatementUseCase(statementRepo, movementRepo);
  const listStatements = new ListBankStatementsUseCase(statementRepo);
  const getStatement = new GetBankStatementUseCase(statementRepo, movementRepo);
  const reconcileMovement = new ReconcileMovementUseCase(movementRepo);
  const classifyMovement = new ClassifyMovementUseCase(movementRepo);
  const applyAutoRules = new ApplyAutoRulesUseCase(statementRepo, movementRepo, ruleRepo);
  const suggestMatches = new SuggestMatchesUseCase(
    statementRepo,
    movementRepo,
    invoiceRead,
    payableRead
  );
  const createRule = new CreateReconciliationRuleUseCase(ruleRepo);
  const listRules = new ListReconciliationRulesUseCase(ruleRepo);
  const deleteRule = new DeleteReconciliationRuleUseCase(ruleRepo);
  const closeStatement = new CloseStatementUseCase(statementRepo, movementRepo);
  const deleteStatement = new DeleteBankStatementUseCase(statementRepo);
  const updateBalances = new UpdateStatementBalancesUseCase(statementRepo);
  const findMovementCandidates = new FindMovementCandidatesUseCase(movementRepo, invoiceRead, payableRead);
  const documentStorage = new SupabaseBankDocumentStorageAdapter(supabase);
  const uploadMovementDocument = new UploadMovementDocumentUseCase(movementRepo, documentStorage);

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
    uploadMovementDocument
  );

  return { router: controller.router };
}
