import { MovementNotFoundError } from "../../domain/errors.js";
import { normalizeBankDescription } from "../../domain/utils/bank-description.js";
import { MIN_CANDIDATE_CONFIDENCE, scoreCandidate } from "../../domain/services/candidate-scoring.service.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { InvoiceMatchReadPort } from "../../domain/ports/out/invoice-match-read.port.js";
import type { PayableEntryMatchReadPort } from "../../domain/ports/out/payable-entry-match-read.port.js";
import type { MovementMatchHintPort } from "../../domain/ports/out/movement-match-hint.port.js";
import type { BankMovementEntityLinkRepositoryPort } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type {
  FindMovementCandidatesPort,
  FindMovementCandidatesQuery,
  MovementCandidate,
} from "../../domain/ports/in/bank-statement.ports.js";

const TOLERANCE_PCT = 0.02;
const TOLERANCE_MIN_CENTS = 100;

function offsetDays(d: Date, days: number): string {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r.toISOString().slice(0, 10);
}

export class FindMovementCandidatesUseCase implements FindMovementCandidatesPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly invoiceRead: InvoiceMatchReadPort,
    private readonly payableRead: PayableEntryMatchReadPort,
    private readonly hint: MovementMatchHintPort,
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
  ) {}

  async execute(query: FindMovementCandidatesQuery): Promise<MovementCandidate[]> {
    const { organizationId, movementId } = query;
    const movement = await this.movementRepo.findById(organizationId, movementId);
    if (!movement) throw new MovementNotFoundError(movementId);

    const tolerance = Math.max(
      TOLERANCE_MIN_CENTS,
      Math.round(movement.amount * TOLERANCE_PCT)
    );
    const dateFrom = offsetDays(movement.bookingDate, -30);
    const dateTo = offsetDays(movement.bookingDate, 30);

    // Resolve hint once — single DB lookup for this movement
    const normalizedDesc = normalizeBankDescription(movement.description);
    const hintSupplierId = normalizedDesc.length > 0
      ? await this.hint.findSupplierByDescription(organizationId, normalizedDesc)
      : null;

    const [invoiceCandidates, payableCandidates] = await Promise.all([
      this.invoiceRead.findCandidates(organizationId, { amountCents: movement.amount, dateFrom, dateTo, toleranceCents: tolerance }),
      this.payableRead.findCandidates(organizationId, { amountCents: movement.amount, dateFrom, dateTo, toleranceCents: tolerance }),
    ]);

    // Load existing allocations for all candidate entities to compute open balances.
    // Entities may have partial allocations from other movements and still be eligible.
    const allInvoiceIds = invoiceCandidates.map((inv) => inv.id);
    const allPayableIds = payableCandidates.map((pe) => pe.id);
    const [invoiceLinks, payableLinks] = await Promise.all([
      allInvoiceIds.length > 0 ? this.linkRepo.findByEntityIds(organizationId, "invoice", allInvoiceIds) : Promise.resolve([]),
      allPayableIds.length > 0 ? this.linkRepo.findByEntityIds(organizationId, "payable_entry", allPayableIds) : Promise.resolve([]),
    ]);

    const invoiceCandidateIds = new Set(invoiceCandidates.map((inv) => inv.id));

    // Compute existing allocations per entity to derive open balances.
    // Entities linked to other movements may still have remaining open balance.
    const allocByEntity = new Map<string, number>();
    for (const l of [...invoiceLinks, ...payableLinks]) {
      allocByEntity.set(l.entityId, (allocByEntity.get(l.entityId) ?? 0) + l.allocatedAmountCents);
    }

    // ── Partially-reconciled invoices: match by open balance ──────────────────
    // findCandidates only searches by totalWithVat. An invoice that is 60€ with
    // 30€ already allocated won't appear above when the movement is 30€.
    // We scan all existing invoice links, compute open balances, and add those
    // whose open balance falls within tolerance.

    const alreadyCandidateIds = new Set(invoiceCandidates.map((i) => i.id));
    const allInvoiceLinks = await this.linkRepo.findAllByEntityType(organizationId, "invoice");

    // Aggregate total allocated per invoice from the links table
    // (amountCents in the link IS the invoice total at time of reconciliation)
    const linkSumByInvoice = new Map<string, { entityTotal: number; totalAllocated: number }>();
    for (const l of allInvoiceLinks) {
      const prev = linkSumByInvoice.get(l.entityId) ?? { entityTotal: l.amountCents, totalAllocated: 0 };
      prev.totalAllocated += l.allocatedAmountCents;
      linkSumByInvoice.set(l.entityId, prev);
    }

    // Find invoice IDs whose open balance ≈ movement amount and that are not
    // already in the main candidates list
    const partiallyMatchingIds = [...linkSumByInvoice.entries()]
      .filter(([id, { entityTotal, totalAllocated }]) => {
        if (alreadyCandidateIds.has(id)) return false;
        const openBalance = entityTotal - totalAllocated;
        return openBalance > 0 && Math.abs(openBalance - movement.amount) <= tolerance;
      })
      .map(([id]) => id);

    const extraInvoices = partiallyMatchingIds.length > 0
      ? await this.invoiceRead.findByIds(organizationId, partiallyMatchingIds)
      : [];

    // Merge extras into invoiceCandidates list; update allocByEntity for them
    const extraInvoiceIds = new Set<string>();
    for (const inv of extraInvoices) {
      invoiceCandidates.push(inv);
      extraInvoiceIds.add(inv.id);
      const sum = linkSumByInvoice.get(inv.id);
      if (sum) allocByEntity.set(inv.id, sum.totalAllocated);
    }

    // ── Score and build results ───────────────────────────────────────────────

    const results: MovementCandidate[] = [];

    for (const inv of invoiceCandidates) {
      // Currency gap closed: a candidate in a different currency than the
      // movement is never eligible, even if the amount happens to line up
      // (previously stored but unchecked — task's grouped-settlement brief,
      // test #7).
      if (inv.currency !== movement.currency) continue;

      const openBalanceCents = inv.totalWithVat - (allocByEntity.get(inv.id) ?? 0);
      if (openBalanceCents <= 0) continue; // fully paid, skip

      const bestDate = inv.paidAt ?? inv.dueDate ?? inv.invoiceDate;
      // Extra invoices (matched by open balance) are scored by their open balance;
      // main candidates (matched by totalWithVat) are scored by their full total.
      const score = scoreCandidate({
        candidateAmount: extraInvoiceIds.has(inv.id) ? openBalanceCents : inv.totalWithVat,
        candidateOpenBalance: openBalanceCents,
        candidateDates: [inv.paidAt, inv.dueDate, inv.invoiceDate],
        candidateName: inv.supplierName,
        candidateSupplierId: inv.supplierId,
        movementAmount: movement.amount,
        movementDate: movement.bookingDate,
        movementDesc: movement.description,
        hintSupplierId,
      });
      if (score.confidence >= MIN_CANDIDATE_CONFIDENCE) {
        results.push({
          entityType: "invoice",
          entityId: inv.id,
          entityLabel: `${inv.supplierName} — ${inv.invoiceNumber}`,
          supplierId: inv.supplierId,
          amountCents: inv.totalWithVat,
          openBalanceCents,
          date: bestDate,
          ...score,
        });
      }
    }

    for (const pe of payableCandidates) {
      // Skip payable entries that have an associated invoice already in the candidates list
      if (pe.invoiceId && invoiceCandidateIds.has(pe.invoiceId)) continue;

      const openBalanceCents = pe.amount - (allocByEntity.get(pe.id) ?? 0);
      if (openBalanceCents <= 0) continue; // fully paid, skip

      const score = scoreCandidate({
        candidateAmount: pe.amount, // score by total
        candidateOpenBalance: openBalanceCents,
        candidateDates: [pe.dueDate],
        candidateName: pe.supplierName,
        candidateSupplierId: pe.supplierId,
        movementAmount: movement.amount,
        movementDate: movement.bookingDate,
        movementDesc: movement.description,
        hintSupplierId,
      });
      if (score.confidence >= MIN_CANDIDATE_CONFIDENCE) {
        results.push({
          entityType: "payable_entry",
          entityId: pe.id,
          entityLabel: `${pe.supplierName} — ${pe.description}`,
          supplierId: pe.supplierId,
          amountCents: pe.amount,
          openBalanceCents,
          date: pe.dueDate ?? "",
          ...score,
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }
}
