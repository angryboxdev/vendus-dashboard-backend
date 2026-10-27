import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InvoiceReconciliationWritePort } from "../../domain/ports/out/invoice-reconciliation-write.port.js";
import type {
  GroupedSettlementLinkInput,
  GroupedSettlementWritePort,
  GroupedSettlementWriteResult,
} from "../../domain/ports/out/grouped-settlement-write.port.js";
import type { InvoiceMatchReadPort } from "../../domain/ports/out/invoice-match-read.port.js";
import type { InvoicePaymentPort } from "../../domain/ports/out/invoice-payment.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankMovementEntityLinkRepositoryPort } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Fatura conciliada por inteiro → paga em cadeia (conta a pagar e ocorrência ligadas); deixa de o estar
 * (conciliação anulada, extrato eliminado…) → o pagamento feito pela conciliação é desfeito.
 * Decora a escrita para cobrir todos os caminhos (conciliar, anular, eliminar extrato) sem os alterar.
 */
export class InvoicePaymentCascadeWrite implements InvoiceReconciliationWritePort {
  constructor(
    private readonly base: InvoiceReconciliationWritePort,
    private readonly invoiceRead: InvoiceMatchReadPort,
    private readonly payment: InvoicePaymentPort,
  ) {}

  async markReconciled(organizationId: OrganizationId, invoiceId: string, movementDate: Date, bankAccountId?: string | null): Promise<void> {
    const [before] = await this.invoiceRead.findByIds(organizationId, [invoiceId]);
    await this.base.markReconciled(organizationId, invoiceId, movementDate, bankAccountId);
    if (before && before.documentType !== "invoice") return;
    await this.payment.settle(organizationId, {
      invoiceId,
      paidAt: ymd(movementDate),
      bankAccountId: bankAccountId ?? null,
      paidByThisReconciliation: before?.status !== "paid",
    });
  }

  async markPartiallyReconciled(organizationId: OrganizationId, invoiceId: string): Promise<void> {
    await this.base.markPartiallyReconciled(organizationId, invoiceId);
    await this.payment.reopen(organizationId, invoiceId);
  }

  async markUnreconciled(organizationId: OrganizationId, invoiceId: string): Promise<void> {
    await this.base.markUnreconciled(organizationId, invoiceId);
    await this.payment.reopen(organizationId, invoiceId);
  }
}

/**
 * O mesmo para a liquidação agrupada (função SQL atómica): compara as faturas novas e as que o movimento
 * já tinha, antes e depois — as que ficam conciliadas pagam em cadeia, as que deixam de o estar reabrem.
 */
export class GroupedSettlementPaymentCascadeWrite implements GroupedSettlementWritePort {
  constructor(
    private readonly base: GroupedSettlementWritePort,
    private readonly invoiceRead: InvoiceMatchReadPort,
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
    private readonly payment: InvoicePaymentPort,
  ) {}

  async confirm(organizationId: OrganizationId, movementId: string, links: GroupedSettlementLinkInput[]): Promise<GroupedSettlementWriteResult> {
    const previous = await this.linkRepo.findByMovementIds(organizationId, [movementId]);
    const ids = [...new Set([...links.map((l) => l.entityId), ...previous.filter((l) => l.entityType === "invoice").map((l) => l.entityId)])];
    const before = new Map((await this.invoiceRead.findByIds(organizationId, ids)).map((i) => [i.id, i]));

    const result = await this.base.confirm(organizationId, movementId, links);

    const movement = await this.movementRepo.findById(organizationId, movementId);
    for (const after of await this.invoiceRead.findByIds(organizationId, ids)) {
      if (after.documentType !== "invoice") continue;
      if (after.reconciliationStatus === "reconciled") {
        await this.payment.settle(organizationId, {
          invoiceId: after.id,
          paidAt: after.paidAt ?? (movement ? ymd(movement.bookingDate) : ymd(new Date())),
          bankAccountId: movement?.bankAccountId ?? null,
          paidByThisReconciliation: before.get(after.id)?.status !== "paid",
        });
      } else {
        await this.payment.reopen(organizationId, after.id);
      }
    }
    return result;
  }
}
