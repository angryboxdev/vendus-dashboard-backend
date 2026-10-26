import type { DeleteBankStatementCommand, DeleteBankStatementPort } from "../../domain/ports/in/bank-statement.ports.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankMovementEntityLinkRepositoryPort } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type { InvoiceMatchReadPort } from "../../domain/ports/out/invoice-match-read.port.js";
import type { InvoiceReconciliationWritePort } from "../../domain/ports/out/invoice-reconciliation-write.port.js";
import { StatementNotFoundError } from "../../domain/errors.js";

/** O que é preciso para devolver as faturas ao estado certo quando os movimentos do extrato desaparecem. */
export interface StatementDeletionDeps {
  movementRepo: BankMovementRepositoryPort;
  linkRepo: BankMovementEntityLinkRepositoryPort;
  invoiceRead: InvoiceMatchReadPort;
  invoiceReconciliationWrite: InvoiceReconciliationWritePort;
}

/**
 * Elimina um extrato importado (para o voltar a importar). Os movimentos dele saem em cascata na BD, e com
 * eles os vínculos a faturas/contas a pagar — por isso, antes, recolhem-se as faturas ligadas e, depois,
 * recalcula-se o estado de cada uma pelos vínculos que restam (como em «Anular conciliação»): sem vínculos
 * → por conciliar; com vínculos de outros movimentos abaixo do total → parcial; ainda paga por outros
 * movimentos → fica como está. Sem isto, as faturas ficavam «pagas» sem nenhum movimento a pagá-las.
 */
export class DeleteBankStatementUseCase implements DeleteBankStatementPort {
  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort,
    private readonly deps?: StatementDeletionDeps,
  ) {}

  async execute(command: DeleteBankStatementCommand): Promise<void> {
    const { organizationId, statementImportId } = command;
    const statement = await this.statementRepo.findById(organizationId, statementImportId);
    if (!statement) throw new StatementNotFoundError(statementImportId);

    const affectedInvoiceIds = this.deps ? await this.unlinkMovements(organizationId, statementImportId) : [];
    await this.statementRepo.delete(organizationId, statementImportId);
    if (this.deps && affectedInvoiceIds.length > 0) await this.recomputeInvoices(organizationId, affectedInvoiceIds);
  }

  /** Tira os vínculos dos movimentos do extrato (a cascata da BD fá-lo também; aqui fica explícito) e devolve as faturas afetadas. */
  private async unlinkMovements(organizationId: DeleteBankStatementCommand["organizationId"], statementImportId: string): Promise<string[]> {
    const { movementRepo, linkRepo } = this.deps!;
    const movements = await movementRepo.findByStatementId(organizationId, statementImportId);
    if (movements.length === 0) return [];
    const links = await linkRepo.findByMovementIds(organizationId, movements.map((m) => m.id));
    const linkedMovementIds = [...new Set(links.map((l) => l.movementId))];
    for (const id of linkedMovementIds) await linkRepo.deleteByMovementId(organizationId, id);
    return [...new Set(links.filter((l) => l.entityType === "invoice").map((l) => l.entityId))];
  }

  private async recomputeInvoices(organizationId: DeleteBankStatementCommand["organizationId"], invoiceIds: string[]): Promise<void> {
    const { linkRepo, invoiceRead, invoiceReconciliationWrite } = this.deps!;
    const [invoices, remainingLinks] = await Promise.all([
      invoiceRead.findByIds(organizationId, invoiceIds),
      linkRepo.findByEntityIds(organizationId, "invoice", invoiceIds),
    ]);
    const allocated = new Map<string, number>();
    for (const l of remainingLinks) allocated.set(l.entityId, (allocated.get(l.entityId) ?? 0) + l.allocatedAmountCents);

    for (const inv of invoices) {
      const total = allocated.get(inv.id) ?? 0;
      if (total === 0) await invoiceReconciliationWrite.markUnreconciled(organizationId, inv.id);
      else if (total < inv.totalWithVat - 1) await invoiceReconciliationWrite.markPartiallyReconciled(organizationId, inv.id);
      // ainda totalmente paga por outros movimentos: o estado não muda
    }
  }
}
