import { StatementNotFoundError } from "../../domain/errors.js";
import { RESOLVED_STATUSES } from "../../domain/entities/bank-movement.js";
import type { BankStatementImportRepositoryPort } from "../../domain/ports/out/bank-statement-import-repository.port.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { InvoiceMatchReadPort } from "../../domain/ports/out/invoice-match-read.port.js";
import type { PayableEntryMatchReadPort } from "../../domain/ports/out/payable-entry-match-read.port.js";
import type {
  MatchSuggestion,
  SuggestMatchesPort,
} from "../../domain/ports/in/bank-statement.ports.js";
import type { BankMovement } from "../../domain/entities/bank-movement.js";

/** Confidence boost when supplier name appears in the movement description. */
const SUPPLIER_NAME_BOOST = 0.2;
/** Confidence for exact amount match. */
const EXACT_AMOUNT_CONFIDENCE = 0.6;
/** Date proximity bonus: <= 7 days. */
const DATE_CLOSE_BONUS = 0.15;
/** Date proximity bonus: 8–30 days. */
const DATE_NEAR_BONUS = 0.05;
/** Minimum confidence to include in suggestions. */
const MIN_CONFIDENCE = 0.4;
/** Amount tolerance: 2% of amount, min 1€. */
const TOLERANCE_PCT = 0.02;
const TOLERANCE_MIN_CENTS = 100;

function dateDiffDays(a: Date, b: Date): number {
  return Math.abs((a.getTime() - b.getTime()) / 86_400_000);
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function offsetDays(d: Date, days: number): string {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r.toISOString().slice(0, 10);
}

export class SuggestMatchesUseCase implements SuggestMatchesPort {
  constructor(
    private readonly statementRepo: BankStatementImportRepositoryPort,
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly invoiceRead: InvoiceMatchReadPort,
    private readonly payableRead: PayableEntryMatchReadPort
  ) {}

  async execute(statementImportId: string): Promise<MatchSuggestion[]> {
    const statement = await this.statementRepo.findById(statementImportId);
    if (!statement) throw new StatementNotFoundError(statementImportId);

    const movements = await this.movementRepo.findByStatementId(statementImportId);
    // Only debit movements that are not yet resolved and have no pending suggestion
    const unresolved = movements.filter(
      (m) =>
        m.movementType === "debit" &&
        !RESOLVED_STATUSES.has(m.reconciliationStatus) &&
        m.reconciliationStatus !== "sugestao"
    );

    const suggestions: MatchSuggestion[] = [];
    // Track entity IDs already claimed in this run to prevent the same
    // invoice/payable from being suggested to more than one movement
    const claimedEntityIds = new Set<string>();

    for (const movement of unresolved) {
      const suggestion = await this.findBestMatch(movement, claimedEntityIds);
      if (suggestion) {
        suggestions.push(suggestion);
        claimedEntityIds.add(suggestion.entityId);
        const updated = movement.markAsSuggestion(
          suggestion.entityType,
          suggestion.entityId,
          suggestion.confidence
        );
        await this.movementRepo.update(updated);
      }
    }

    return suggestions;
  }

  private async findBestMatch(
    movement: BankMovement,
    claimedEntityIds: Set<string>
  ): Promise<MatchSuggestion | null> {
    const tolerance = Math.max(
      TOLERANCE_MIN_CENTS,
      Math.round(movement.amount * TOLERANCE_PCT)
    );
    const dateFrom = offsetDays(movement.bookingDate, -30);
    const dateTo = offsetDays(movement.bookingDate, 30);

    const [invoiceCandidates, payableCandidates] = await Promise.all([
      this.invoiceRead.findCandidates({
        amountCents: movement.amount,
        dateFrom,
        dateTo,
        toleranceCents: tolerance,
      }),
      this.payableRead.findCandidates({
        amountCents: movement.amount,
        dateFrom,
        dateTo,
        toleranceCents: tolerance,
      }),
    ]);

    let best: MatchSuggestion | null = null;

    for (const inv of invoiceCandidates) {
      if (claimedEntityIds.has(inv.id)) continue;
      const confidence = this.scoreCandidate({
        candidateAmount: inv.totalWithVat,
        // Best date to compare with movement: paid_at > due_date > invoice_date
        candidateDueDateStr: inv.paidAt ?? inv.dueDate ?? inv.invoiceDate,
        candidateName: inv.supplierName,
        movementAmount: movement.amount,
        movementDate: movement.bookingDate,
        movementDesc: movement.description,
      });
      if (confidence >= MIN_CONFIDENCE && (!best || confidence > best.confidence)) {
        best = {
          movementId: movement.id,
          entityType: "invoice",
          entityId: inv.id,
          entityLabel: `${inv.supplierName} — ${inv.invoiceNumber}`,
          confidence,
        };
      }
    }

    for (const pe of payableCandidates) {
      if (claimedEntityIds.has(pe.id)) continue;
      const confidence = this.scoreCandidate({
        candidateAmount: pe.amount,
        candidateDueDateStr: pe.dueDate,
        candidateName: pe.supplierName,
        movementAmount: movement.amount,
        movementDate: movement.bookingDate,
        movementDesc: movement.description,
      });
      if (confidence >= MIN_CONFIDENCE && (!best || confidence > best.confidence)) {
        best = {
          movementId: movement.id,
          entityType: "payable_entry",
          entityId: pe.id,
          entityLabel: `${pe.supplierName} — ${pe.description}`,
          confidence,
        };
      }
    }

    return best;
  }

  private scoreCandidate(opts: {
    candidateAmount: number;
    candidateDueDateStr: string | null;
    candidateName: string;
    movementAmount: number;
    movementDate: Date;
    movementDesc: string;
  }): number {
    let score = 0;

    // Amount match
    const amountDiff = Math.abs(opts.candidateAmount - opts.movementAmount);
    if (amountDiff === 0) {
      score += EXACT_AMOUNT_CONFIDENCE;
    } else {
      const pct = amountDiff / opts.movementAmount;
      score += Math.max(0, EXACT_AMOUNT_CONFIDENCE * (1 - pct / TOLERANCE_PCT));
    }

    // Date proximity
    if (opts.candidateDueDateStr) {
      const dueDate = new Date(opts.candidateDueDateStr + "T00:00:00.000Z");
      const diff = dateDiffDays(opts.movementDate, dueDate);
      if (diff <= 7) score += DATE_CLOSE_BONUS;
      else if (diff <= 30) score += DATE_NEAR_BONUS;
    }

    // Supplier name in description
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
}
