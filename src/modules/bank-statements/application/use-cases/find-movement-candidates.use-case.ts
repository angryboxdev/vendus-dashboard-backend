import { MovementNotFoundError } from "../../domain/errors.js";
import { normalizeBankDescription } from "../../domain/utils/bank-description.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { InvoiceMatchReadPort } from "../../domain/ports/out/invoice-match-read.port.js";
import type { PayableEntryMatchReadPort } from "../../domain/ports/out/payable-entry-match-read.port.js";
import type { MovementMatchHintPort } from "../../domain/ports/out/movement-match-hint.port.js";
import type { BankMovementEntityLinkRepositoryPort } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type {
  FindMovementCandidatesPort,
  MovementCandidate,
} from "../../domain/ports/in/bank-statement.ports.js";

const HINT_MATCH_BOOST = 0.35;
const SUPPLIER_NAME_BOOST = 0.2;
const EXACT_AMOUNT_CONFIDENCE = 0.6;
const DATE_CLOSE_BONUS = 0.15;
const DATE_NEAR_BONUS = 0.05;
const MIN_CONFIDENCE = 0.4;
const TOLERANCE_PCT = 0.02;
const TOLERANCE_MIN_CENTS = 100;

function dateDiffDays(a: Date, b: Date): number {
  return Math.abs((a.getTime() - b.getTime()) / 86_400_000);
}

function offsetDays(d: Date, days: number): string {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r.toISOString().slice(0, 10);
}

function scoreCandidate(opts: {
  candidateAmount: number;
  candidateDateStr: string | null;
  candidateName: string;
  candidateSupplierId: string | null;
  movementAmount: number;
  movementDate: Date;
  movementDesc: string;
  hintSupplierId: string | null;
}): number {
  let score = 0;

  const amountDiff = Math.abs(opts.candidateAmount - opts.movementAmount);
  if (amountDiff === 0) {
    score += EXACT_AMOUNT_CONFIDENCE;
  } else {
    const pct = amountDiff / opts.movementAmount;
    score += Math.max(0, EXACT_AMOUNT_CONFIDENCE * (1 - pct / TOLERANCE_PCT));
  }

  if (opts.candidateDateStr) {
    const date = new Date(opts.candidateDateStr + "T00:00:00.000Z");
    const diff = dateDiffDays(opts.movementDate, date);
    if (diff <= 7) score += DATE_CLOSE_BONUS;
    else if (diff <= 30) score += DATE_NEAR_BONUS;
  }

  // Hint match (stronger signal — confirmed by past reconciliation)
  if (opts.hintSupplierId && opts.candidateSupplierId === opts.hintSupplierId) {
    score += HINT_MATCH_BOOST;
  } else {
    // Fallback: supplier name substring in description
    const desc = opts.movementDesc.toLowerCase();
    const nameWords = opts.candidateName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    if (nameWords.some((w) => desc.includes(w))) {
      score += SUPPLIER_NAME_BOOST;
    }
  }

  return Math.min(1, score);
}

export class FindMovementCandidatesUseCase implements FindMovementCandidatesPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly invoiceRead: InvoiceMatchReadPort,
    private readonly payableRead: PayableEntryMatchReadPort,
    private readonly hint: MovementMatchHintPort,
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
  ) {}

  async execute(movementId: string): Promise<MovementCandidate[]> {
    const movement = await this.movementRepo.findById(movementId);
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
      ? await this.hint.findSupplierByDescription(normalizedDesc)
      : null;

    const [invoiceCandidates, payableCandidates] = await Promise.all([
      this.invoiceRead.findCandidates({ amountCents: movement.amount, dateFrom, dateTo, toleranceCents: tolerance }),
      this.payableRead.findCandidates({ amountCents: movement.amount, dateFrom, dateTo, toleranceCents: tolerance }),
    ]);

    // Exclude entities already reconciled with a DIFFERENT movement.
    // (Same movement is allowed — it may be re-reconciling.)
    const allInvoiceIds = invoiceCandidates.map((inv) => inv.id);
    const allPayableIds = payableCandidates.map((pe) => pe.id);
    const [invoiceLinks, payableLinks] = await Promise.all([
      allInvoiceIds.length > 0 ? this.linkRepo.findByEntityIds("invoice", allInvoiceIds) : Promise.resolve([]),
      allPayableIds.length > 0 ? this.linkRepo.findByEntityIds("payable_entry", allPayableIds) : Promise.resolve([]),
    ]);
    const reconciledInvoiceIds = new Set(
      invoiceLinks.filter((l) => l.movementId !== movement.id).map((l) => l.entityId)
    );
    const reconciledPayableIds = new Set(
      payableLinks.filter((l) => l.movementId !== movement.id).map((l) => l.entityId)
    );

    const invoiceCandidateIds = new Set(invoiceCandidates.map((inv) => inv.id));

    const results: MovementCandidate[] = [];

    for (const inv of invoiceCandidates) {
      if (reconciledInvoiceIds.has(inv.id)) continue;
      const bestDate = inv.paidAt ?? inv.dueDate ?? inv.invoiceDate;
      const confidence = scoreCandidate({
        candidateAmount: inv.totalWithVat,
        candidateDateStr: bestDate,
        candidateName: inv.supplierName,
        candidateSupplierId: inv.supplierId,
        movementAmount: movement.amount,
        movementDate: movement.bookingDate,
        movementDesc: movement.description,
        hintSupplierId,
      });
      if (confidence >= MIN_CONFIDENCE) {
        results.push({
          entityType: "invoice",
          entityId: inv.id,
          entityLabel: `${inv.supplierName} — ${inv.invoiceNumber}`,
          supplierId: inv.supplierId,
          amountCents: inv.totalWithVat,
          date: bestDate,
          confidence,
        });
      }
    }

    for (const pe of payableCandidates) {
      // Skip payable entries that have an associated invoice already in the candidates list
      if (pe.invoiceId && invoiceCandidateIds.has(pe.invoiceId)) continue;
      if (reconciledPayableIds.has(pe.id)) continue;

      const confidence = scoreCandidate({
        candidateAmount: pe.amount,
        candidateDateStr: pe.dueDate,
        candidateName: pe.supplierName,
        candidateSupplierId: pe.supplierId,
        movementAmount: movement.amount,
        movementDate: movement.bookingDate,
        movementDesc: movement.description,
        hintSupplierId,
      });
      if (confidence >= MIN_CONFIDENCE) {
        results.push({
          entityType: "payable_entry",
          entityId: pe.id,
          entityLabel: `${pe.supplierName} — ${pe.description}`,
          supplierId: pe.supplierId,
          amountCents: pe.amount,
          date: pe.dueDate ?? "",
          confidence,
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }
}
