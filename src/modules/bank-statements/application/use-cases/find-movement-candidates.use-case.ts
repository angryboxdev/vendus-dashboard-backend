import { MovementNotFoundError } from "../../domain/errors.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { InvoiceMatchReadPort } from "../../domain/ports/out/invoice-match-read.port.js";
import type { PayableEntryMatchReadPort } from "../../domain/ports/out/payable-entry-match-read.port.js";
import type {
  FindMovementCandidatesPort,
  MovementCandidate,
} from "../../domain/ports/in/bank-statement.ports.js";

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
  movementAmount: number;
  movementDate: Date;
  movementDesc: string;
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

  const desc = opts.movementDesc.toLowerCase();
  const nameWords = opts.candidateName
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (nameWords.some((w) => desc.includes(w))) {
    score += SUPPLIER_NAME_BOOST;
  }

  return Math.min(1, score);
}

export class FindMovementCandidatesUseCase implements FindMovementCandidatesPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly invoiceRead: InvoiceMatchReadPort,
    private readonly payableRead: PayableEntryMatchReadPort
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

    const [invoiceCandidates, payableCandidates] = await Promise.all([
      this.invoiceRead.findCandidates({ amountCents: movement.amount, dateFrom, dateTo, toleranceCents: tolerance }),
      this.payableRead.findCandidates({ amountCents: movement.amount, dateFrom, dateTo, toleranceCents: tolerance }),
    ]);

    const results: MovementCandidate[] = [];

    for (const inv of invoiceCandidates) {
      const bestDate = inv.paidAt ?? inv.dueDate ?? inv.invoiceDate;
      const confidence = scoreCandidate({
        candidateAmount: inv.totalWithVat,
        candidateDateStr: bestDate,
        candidateName: inv.supplierName,
        movementAmount: movement.amount,
        movementDate: movement.bookingDate,
        movementDesc: movement.description,
      });
      if (confidence >= MIN_CONFIDENCE) {
        results.push({
          entityType: "invoice",
          entityId: inv.id,
          entityLabel: `${inv.supplierName} — ${inv.invoiceNumber}`,
          amountCents: inv.totalWithVat,
          date: bestDate,
          confidence,
        });
      }
    }

    for (const pe of payableCandidates) {
      const confidence = scoreCandidate({
        candidateAmount: pe.amount,
        candidateDateStr: pe.dueDate,
        candidateName: pe.supplierName,
        movementAmount: movement.amount,
        movementDate: movement.bookingDate,
        movementDesc: movement.description,
      });
      if (confidence >= MIN_CONFIDENCE) {
        results.push({
          entityType: "payable_entry",
          entityId: pe.id,
          entityLabel: `${pe.supplierName} — ${pe.description}`,
          amountCents: pe.amount,
          date: pe.dueDate ?? "",
          confidence,
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }
}
