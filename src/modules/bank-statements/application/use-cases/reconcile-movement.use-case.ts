import { MovementNotFoundError } from "../../domain/errors.js";
import { normalizeBankDescription } from "../../domain/utils/bank-description.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { MovementMatchHintPort } from "../../domain/ports/out/movement-match-hint.port.js";
import type { InvoiceMatchReadPort } from "../../domain/ports/out/invoice-match-read.port.js";
import type { PayableEntryMatchReadPort } from "../../domain/ports/out/payable-entry-match-read.port.js";
import type {
  BankMovementEntityLink,
  BankMovementEntityLinkRepositoryPort,
} from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type {
  ReconcileMovementCommand,
  ReconcileMovementPort,
} from "../../domain/ports/in/bank-statement.ports.js";
import type { InvoiceReconciliationWritePort } from "../../domain/ports/out/invoice-reconciliation-write.port.js";

export class ReconcileMovementUseCase implements ReconcileMovementPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly hint: MovementMatchHintPort,
    private readonly invoiceRead: InvoiceMatchReadPort,
    private readonly payableRead: PayableEntryMatchReadPort,
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
    private readonly invoiceReconciliationWrite: InvoiceReconciliationWritePort,
  ) {}

  async execute(command: ReconcileMovementCommand): Promise<void> {
    // ── 1. Input validation ───────────────────────────────────────────────────

    if (command.entityLinks.length === 0) {
      throw new Error("At least one entity link is required");
    }
    for (const el of command.entityLinks) {
      if (el.allocatedAmountCents <= 0) {
        throw new Error(`allocatedAmountCents must be positive (got ${el.allocatedAmountCents})`);
      }
    }

    // ── 2. Fetch movement ─────────────────────────────────────────────────────

    const { organizationId } = command;
    const movement = await this.movementRepo.findById(organizationId, command.movementId);
    if (!movement) throw new MovementNotFoundError(command.movementId);

    // ── 3. Validate total allocated ≤ movement amount ─────────────────────────

    const totalAllocated = command.entityLinks.reduce((s, el) => s + el.allocatedAmountCents, 0);
    if (totalAllocated > movement.amount) {
      throw new Error(
        `Total allocated (${totalAllocated}) exceeds movement amount (${movement.amount})`
      );
    }

    // ── 4. Fetch this movement's current links (for re-reconciliation) ────────
    //   When re-reconciling, the current movement's existing allocations will be
    //   deleted. We factor them back in when computing each entity's open balance
    //   so the validation is not distorted by the outgoing allocations.

    const currentLinks = await this.linkRepo.findByMovementIds(organizationId, [command.movementId]);
    const currentAllocByEntity = new Map(
      currentLinks.map((l) => [l.entityId, l.allocatedAmountCents])
    );

    // ── 5. Fetch entities ─────────────────────────────────────────────────────

    const invoiceIds = command.entityLinks
      .filter((l) => l.entityType === "invoice")
      .map((l) => l.entityId);
    const payableIds = command.entityLinks
      .filter((l) => l.entityType === "payable_entry")
      .map((l) => l.entityId);

    const [invoices, payables] = await Promise.all([
      invoiceIds.length > 0 ? this.invoiceRead.findByIds(organizationId, invoiceIds) : Promise.resolve([]),
      payableIds.length > 0 ? this.payableRead.findByIds(organizationId, payableIds) : Promise.resolve([]),
    ]);

    const invoiceMap = new Map(invoices.map((i) => [i.id, i]));
    const payableMap = new Map(payables.map((p) => [p.id, p]));

    // ── 6. Fetch existing allocations for all entities across ALL movements ───
    //   Used to compute each entity's open balance.

    const [existingInvoiceLinks, existingPayableLinks] = await Promise.all([
      invoiceIds.length > 0
        ? this.linkRepo.findByEntityIds(organizationId, "invoice", invoiceIds)
        : Promise.resolve([]),
      payableIds.length > 0
        ? this.linkRepo.findByEntityIds(organizationId, "payable_entry", payableIds)
        : Promise.resolve([]),
    ]);

    const totalAllocByEntity = new Map<string, number>();
    for (const l of [...existingInvoiceLinks, ...existingPayableLinks]) {
      totalAllocByEntity.set(
        l.entityId,
        (totalAllocByEntity.get(l.entityId) ?? 0) + l.allocatedAmountCents
      );
    }

    // ── 7. Build links, validate open balances ────────────────────────────────

    const links: BankMovementEntityLink[] = command.entityLinks.map((el) => {
      let entityTotal: number;
      let entityLabel: string;

      if (el.entityType === "invoice") {
        const inv = invoiceMap.get(el.entityId);
        if (!inv) throw new Error(`Invoice not found: ${el.entityId}`);
        entityTotal = inv.totalWithVat;
        entityLabel = `${inv.supplierName} — ${inv.invoiceNumber}`;
      } else {
        const pe = payableMap.get(el.entityId);
        if (!pe) throw new Error(`Payable entry not found: ${el.entityId}`);
        entityTotal = pe.amount;
        entityLabel = `${pe.supplierName} — ${pe.description}`;
      }

      // Open balance = entity total − all existing allocations + this movement's outgoing allocation
      // (the current movement's links are about to be deleted, so we add them back)
      const existingAlloc = totalAllocByEntity.get(el.entityId) ?? 0;
      const outgoingAlloc = currentAllocByEntity.get(el.entityId) ?? 0;
      const openBalance = entityTotal - existingAlloc + outgoingAlloc;

      if (el.allocatedAmountCents > openBalance) {
        throw new Error(
          `Allocated amount (${el.allocatedAmountCents} cts) exceeds open balance ` +
          `(${openBalance} cts) for entity ${el.entityId}`
        );
      }

      return {
        id: crypto.randomUUID(),
        movementId: movement.id,
        entityType: el.entityType,
        entityId: el.entityId,
        amountCents: entityTotal,
        allocatedAmountCents: el.allocatedAmountCents,
        entityLabel,
      };
    });

    // ── 8. Compute movement status ────────────────────────────────────────────

    const amountDiff = movement.amount - totalAllocated;
    const updated = movement.multiReconcile(amountDiff);

    // ── 9. Persist ────────────────────────────────────────────────────────────

    await this.movementRepo.update(organizationId, updated);
    await this.linkRepo.deleteByMovementId(organizationId, movement.id);
    await this.linkRepo.saveAll(organizationId, links);

    // ── 10. Save learning hint — only for single-entity full-movement matches ─

    const isFull = updated.reconciliationAmountDiff === null;
    const firstLink = command.entityLinks[0]!;
    if (isFull && command.entityLinks.length === 1 && firstLink.supplierId) {
      const normalizedDesc = normalizeBankDescription(movement.description);
      if (normalizedDesc.length > 0) {
        await this.hint.save(organizationId, normalizedDesc, firstLink.supplierId);
      }
    }

    // ── 11. Propagate reconciliation status to affected invoices ─────────────
    //   Affected = new invoice links ∪ previous invoice links (re-reconciliation)

    const prevInvoiceIds = currentLinks
      .filter((l) => l.entityType === "invoice")
      .map((l) => l.entityId);
    const newInvoiceIds = command.entityLinks
      .filter((l) => l.entityType === "invoice")
      .map((l) => l.entityId);
    const affectedInvoiceIds = [...new Set([...newInvoiceIds, ...prevInvoiceIds])];

    if (affectedInvoiceIds.length > 0) {
      // Fetch invoices that are NOT already in invoiceMap (i.e. those removed by re-reconciliation)
      const missingIds = affectedInvoiceIds.filter((id) => !invoiceMap.has(id));
      if (missingIds.length > 0) {
        const missing = await this.invoiceRead.findByIds(organizationId, missingIds);
        for (const inv of missing) {
          invoiceMap.set(inv.id, inv);
        }
      }

      // Fetch all current links for these invoices (already saved in step 9)
      const allLinksForInvoices = await this.linkRepo.findByEntityIds(organizationId, "invoice", affectedInvoiceIds);

      const allocByInvoice = new Map<string, number>();
      for (const l of allLinksForInvoices) {
        allocByInvoice.set(l.entityId, (allocByInvoice.get(l.entityId) ?? 0) + l.allocatedAmountCents);
      }

      await Promise.all(
        affectedInvoiceIds.map(async (invoiceId) => {
          const totalAllocated = allocByInvoice.get(invoiceId) ?? 0;
          const inv = invoiceMap.get(invoiceId);
          if (!inv) return; // safety guard
          const invoiceTotalWithVat = inv.totalWithVat;

          if (totalAllocated === 0) {
            await this.invoiceReconciliationWrite.markUnreconciled(organizationId, invoiceId);
          } else if (totalAllocated >= invoiceTotalWithVat - 1) {
            await this.invoiceReconciliationWrite.markReconciled(organizationId, invoiceId, movement.bookingDate);
          } else {
            await this.invoiceReconciliationWrite.markPartiallyReconciled(organizationId, invoiceId);
          }
        })
      );
    }
  }
}
