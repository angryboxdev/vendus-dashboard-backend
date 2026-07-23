import { MovementNotFoundError, EntityAlreadyReconciledError } from "../../domain/errors.js";
import { normalizeBankDescription } from "../../domain/utils/bank-description.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { MovementMatchHintPort } from "../../domain/ports/out/movement-match-hint.port.js";
import type { InvoiceMatchReadPort } from "../../domain/ports/out/invoice-match-read.port.js";
import type { PayableEntryMatchReadPort } from "../../domain/ports/out/payable-entry-match-read.port.js";
import type { BankMovementEntityLinkRepositoryPort, BankMovementEntityLink } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type {
  ReconcileMovementCommand,
  ReconcileMovementPort,
} from "../../domain/ports/in/bank-statement.ports.js";

export class ReconcileMovementUseCase implements ReconcileMovementPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly hint: MovementMatchHintPort,
    private readonly invoiceRead: InvoiceMatchReadPort,
    private readonly payableRead: PayableEntryMatchReadPort,
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
  ) {}

  async execute(command: ReconcileMovementCommand): Promise<void> {
    if (command.entityLinks.length === 0) {
      throw new Error("At least one entity link is required");
    }

    const movement = await this.movementRepo.findById(command.movementId);
    if (!movement) throw new MovementNotFoundError(command.movementId);

    // ── 1. Look up entity amounts and labels ──────────────────────────────────

    const invoiceIds = command.entityLinks
      .filter((l) => l.entityType === "invoice")
      .map((l) => l.entityId);
    const payableIds = command.entityLinks
      .filter((l) => l.entityType === "payable_entry")
      .map((l) => l.entityId);

    // Guard: ensure none of the entities are already reconciled with a DIFFERENT movement.
    // (Re-reconciling the same movement is allowed — its old links will be replaced.)
    const [existingInvoiceLinks, existingPayableLinks, invoices, payables] = await Promise.all([
      invoiceIds.length > 0 ? this.linkRepo.findByEntityIds("invoice", invoiceIds) : Promise.resolve([]),
      payableIds.length > 0 ? this.linkRepo.findByEntityIds("payable_entry", payableIds) : Promise.resolve([]),
      invoiceIds.length > 0 ? this.invoiceRead.findByIds(invoiceIds) : Promise.resolve([]),
      payableIds.length > 0 ? this.payableRead.findByIds(payableIds) : Promise.resolve([]),
    ]);

    for (const link of [...existingInvoiceLinks, ...existingPayableLinks]) {
      if (link.movementId !== command.movementId) {
        throw new EntityAlreadyReconciledError(link.entityType, link.entityId);
      }
    }

    const invoiceMap = new Map(invoices.map((i) => [i.id, i]));
    const payableMap = new Map(payables.map((p) => [p.id, p]));

    // ── 2. Build entity links with amounts ───────────────────────────────────

    const links: BankMovementEntityLink[] = command.entityLinks.map((el) => {
      if (el.entityType === "invoice") {
        const inv = invoiceMap.get(el.entityId);
        if (!inv) throw new Error(`Invoice not found: ${el.entityId}`);
        return {
          id: crypto.randomUUID(),
          movementId: movement.id,
          entityType: "invoice" as const,
          entityId: el.entityId,
          amountCents: inv.totalWithVat,
          entityLabel: `${inv.supplierName} — ${inv.invoiceNumber}`,
        };
      } else {
        const pe = payableMap.get(el.entityId);
        if (!pe) throw new Error(`Payable entry not found: ${el.entityId}`);
        return {
          id: crypto.randomUUID(),
          movementId: movement.id,
          entityType: "payable_entry" as const,
          entityId: el.entityId,
          amountCents: pe.amount,
          entityLabel: `${pe.supplierName} — ${pe.description}`,
        };
      }
    });

    // ── 3. Compute amount difference and determine status ────────────────────

    const totalLinked = links.reduce((sum, l) => sum + l.amountCents, 0);
    const amountDiff = movement.amount - totalLinked;
    const updated = movement.multiReconcile(amountDiff);

    // ── 4. Persist ───────────────────────────────────────────────────────────

    await this.movementRepo.update(updated);
    await this.linkRepo.deleteByMovementId(movement.id);
    await this.linkRepo.saveAll(links);

    // ── 5. Save learning hint — only for single-entity full matches ──────────

    const isFull = updated.reconciliationAmountDiff === null;
    const firstLink = command.entityLinks[0]!;
    if (isFull && command.entityLinks.length === 1 && firstLink.supplierId) {
      const normalizedDesc = normalizeBankDescription(movement.description);
      if (normalizedDesc.length > 0) {
        await this.hint.save(normalizedDesc, firstLink.supplierId);
      }
    }
  }
}
