import { MovementNotFoundError } from "../../domain/errors.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { BankMovementEntityLinkRepositoryPort } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type { InvoiceMatchReadPort } from "../../domain/ports/out/invoice-match-read.port.js";
import type { InvoiceReconciliationWritePort } from "../../domain/ports/out/invoice-reconciliation-write.port.js";
import type { UnreconcileMovementPort } from "../../domain/ports/in/bank-statement.ports.js";

export class UnreconcileMovementUseCase implements UnreconcileMovementPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
    private readonly invoiceRead: InvoiceMatchReadPort,
    private readonly invoiceReconciliationWrite: InvoiceReconciliationWritePort,
  ) {}

  async execute(movementId: string): Promise<void> {
    const movement = await this.movementRepo.findById(movementId);
    if (!movement) throw new MovementNotFoundError(movementId);

    // Snapshot current links before deleting
    const currentLinks = await this.linkRepo.findByMovementIds([movementId]);
    const affectedInvoiceIds = [...new Set(
      currentLinks.filter((l) => l.entityType === "invoice").map((l) => l.entityId),
    )];

    // Delete all entity links and reset the movement
    await this.linkRepo.deleteByMovementId(movementId);
    await this.movementRepo.update(movement.unreconcile());

    // Recompute reconciliation status for previously linked invoices
    if (affectedInvoiceIds.length > 0) {
      const [invoices, remainingLinks] = await Promise.all([
        this.invoiceRead.findByIds(affectedInvoiceIds),
        this.linkRepo.findByEntityIds("invoice", affectedInvoiceIds),
      ]);

      const invoiceMap = new Map(invoices.map((i) => [i.id, i]));
      const allocByInvoice = new Map<string, number>();
      for (const l of remainingLinks) {
        allocByInvoice.set(l.entityId, (allocByInvoice.get(l.entityId) ?? 0) + l.allocatedAmountCents);
      }

      await Promise.all(
        affectedInvoiceIds.map(async (invoiceId) => {
          const totalAllocated = allocByInvoice.get(invoiceId) ?? 0;
          const inv = invoiceMap.get(invoiceId);
          if (!inv) return;

          if (totalAllocated === 0) {
            await this.invoiceReconciliationWrite.markUnreconciled(invoiceId);
          } else if (totalAllocated >= inv.totalWithVat - 1) {
            await this.invoiceReconciliationWrite.markReconciled(invoiceId, movement.bookingDate);
          } else {
            await this.invoiceReconciliationWrite.markPartiallyReconciled(invoiceId);
          }
        }),
      );
    }
  }
}
