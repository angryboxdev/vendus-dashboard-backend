import { normalizeBankDescription } from "../../domain/utils/bank-description.js";
import { AMOUNT_MATCH_TOLERANCE_CENTS, isStrongSuggestion, scoreCandidate, type CandidateScore } from "../../domain/services/candidate-scoring.service.js";
import type { OccurrenceMatchCandidate, OccurrenceMatchReadPort } from "../../domain/ports/out/occurrence-match-read.port.js";
import type { BankMovement } from "../../domain/entities/bank-movement.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type {
  FindMovementCandidatesPort,
  GetMonthlySuggestionsPort,
  GetMonthlySuggestionsQuery,
  MonthlyEntityMatchSuggestion,
  MonthlyOccurrenceMatchSuggestion,
  MonthlySuggestions,
  RepeatJustificationSuggestion,
} from "../../domain/ports/in/bank-statement.ports.js";

/** Far enough back to cover any account's real history without an explicit start date. */
const EARLIEST_HISTORY_DATE = new Date("2000-01-01T00:00:00.000Z");

function monthRange(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // last day of month
  return { from, to };
}

/**
 * Builds normalizedDescription → most recent eligible source movement, scanning
 * every movement of the account booked before the target month. Eligible means
 * classified without an invoice (a real "justificar despesa sem fatura" —
 * salary transfers, bank fees, internal transfers, loans) — never a movement
 * reconciled against an invoice/payable entry, even a recurring one (e.g.
 * Makro, EDP): those must always go through the invoice-matching engine
 * (entityMatches below), never be blindly repeated from a past month.
 *
 * `matchedEntityType` is NOT a reliable signal for "reconciled with an
 * invoice": `BankMovement.multiReconcile()` (the actual invoice/payable
 * reconciliation path) sets `justificationType: "fatura"` but leaves
 * `matchedEntityType: null` — the real links live in the separate
 * `bank_movement_entity_links` table, not on the movement itself. So the
 * exclusion has to check `justificationType !== "fatura"` explicitly.
 * `matchedEntityType !== null` is still excluded too — it only happens for
 * `classify()` with a `recurrence_occurrence` link (contrato_recorrencia),
 * whose `matchedEntityId` points at one specific month's occurrence and
 * can't be blindly reused for a different month either.
 * `sem_justificativa` is excluded because it doesn't actually resolve the
 * movement (`saida_nao_justificada` isn't a resolved status) — there is
 * nothing useful to repeat.
 */
function buildRecurringJustificationIndex(history: BankMovement[]): Map<string, BankMovement> {
  const latestByDescription = new Map<string, BankMovement>();
  for (const m of history) {
    if (
      !m.isResolved ||
      !m.justificationType ||
      m.justificationType === "fatura" ||
      m.justificationType === "sem_justificativa" ||
      m.matchedEntityType !== null
    ) continue;
    const key = normalizeBankDescription(m.description);
    if (!key) continue;
    const current = latestByDescription.get(key);
    if (!current || m.bookingDate.getTime() > current.bookingDate.getTime()) {
      latestByDescription.set(key, m);
    }
  }
  return latestByDescription;
}

const DAY_MS = 86_400_000;

/** A melhor ocorrência para um movimento: nome (beneficiário ou nome da recorrência) e valor previsto. */
function bestOccurrence(
  movement: BankMovement,
  occurrences: OccurrenceMatchCandidate[],
  claimed: ReadonlySet<string>,
): { occurrence: OccurrenceMatchCandidate; score: CandidateScore } | null {
  let best: { occurrence: OccurrenceMatchCandidate; score: CandidateScore } | null = null;
  for (const o of occurrences) {
    if (claimed.has(o.id) || o.status === "paid") continue;
    const base = {
      candidateAmount: o.effectiveAmountCents,
      candidateOpenBalance: o.effectiveAmountCents,
      candidateDates: [o.dueDate],
      candidateSupplierId: o.supplierId,
      movementAmount: movement.amount,
      movementDate: movement.bookingDate,
      movementDesc: movement.description,
      hintSupplierId: null,
    };
    const byPayee = scoreCandidate({ ...base, candidateName: o.supplierName });
    const score = byPayee.nameMatched ? byPayee : scoreCandidate({ ...base, candidateName: o.recurrenceName });
    if (!isStrongSuggestion(score)) continue;
    if (!best || score.confidence > best.score.confidence) best = { occurrence: o, score };
  }
  return best;
}

export class GetMonthlySuggestionsUseCase implements GetMonthlySuggestionsPort {
  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly findMovementCandidates: FindMovementCandidatesPort,
    /** Recorrências sem fatura (salários, rendas…): sugeridas por nome e valor, como as faturas. */
    private readonly occurrenceRead?: OccurrenceMatchReadPort,
  ) {}

  async execute(query: GetMonthlySuggestionsQuery): Promise<MonthlySuggestions> {
    const { organizationId, bankAccountId, year, month } = query;
    const { from, to } = monthRange(year, month);

    const monthMovements = await this.movementRepo.findByAccountAndPeriod(organizationId, bankAccountId, from, to);
    const pending = monthMovements.filter((m) => !m.isResolved);
    if (pending.length === 0) {
      return { entityMatches: [], occurrenceMatches: [], repeatJustifications: [] };
    }

    const history = await this.movementRepo.findByAccountAndPeriod(
      organizationId,
      bankAccountId,
      EARLIEST_HISTORY_DATE,
      new Date(from.getTime() - 1),
    );
    const recurringIndex = buildRecurringJustificationIndex(history);

    // Candidate lookups are independent per movement — run them concurrently,
    // then apply the "don't suggest the same invoice/payable twice" dedup
    // sequentially in a stable (chronological) order.
    const candidatesByMovement = await Promise.all(
      pending.map((movement) => this.findMovementCandidates.execute({ organizationId, movementId: movement.id })),
    );

    // Uma só leitura das ocorrências à volta do mês (±30 dias do vencimento).
    const occurrences = this.occurrenceRead
      ? await this.occurrenceRead.search(organizationId, {
          dateFrom: new Date(from.getTime() - 30 * DAY_MS).toISOString().slice(0, 10),
          dateTo: new Date(to.getTime() + 30 * DAY_MS).toISOString().slice(0, 10),
          limit: 500,
        })
      : [];

    const entityMatches: MonthlyEntityMatchSuggestion[] = [];
    const occurrenceMatches: MonthlyOccurrenceMatchSuggestion[] = [];
    const repeatJustifications: RepeatJustificationSuggestion[] = [];
    const claimedEntityIds = new Set<string>();
    const claimedOccurrenceIds = new Set<string>();

    pending.forEach((movement, i) => {
      // Só sugestões fortes: nome E valor a bater e confiança ≥ 90% (decisão do utilizador).
      const best = candidatesByMovement[i]!.find((c) => isStrongSuggestion(c) && !claimedEntityIds.has(c.entityId));
      if (best) {
        claimedEntityIds.add(best.entityId);
        entityMatches.push({
          movementId: movement.id,
          entityType: best.entityType,
          entityId: best.entityId,
          entityLabel: best.entityLabel,
          amountCents: best.amountCents,
          openBalanceCents: best.openBalanceCents,
          supplierId: best.supplierId,
          confidence: best.confidence,
        });
        return; // an entity match takes priority over repeating a past classification
      }

      // Recorrência sem fatura (salário, renda…): conciliar deixa a ocorrência paga.
      const occ = movement.movementType === "debit" ? bestOccurrence(movement, occurrences, claimedOccurrenceIds) : null;
      if (occ) {
        claimedOccurrenceIds.add(occ.occurrence.id);
        const o = occ.occurrence;
        occurrenceMatches.push({
          movementId: movement.id,
          occurrenceId: o.id,
          recurrenceName: o.recurrenceName,
          supplierName: o.supplierName,
          period: o.period,
          amountCents: o.effectiveAmountCents,
          confidence: occ.score.confidence,
          supplierId: o.supplierId,
          costCenterGroupId: o.costCenterGroupId,
          costCenterCategoryId: o.costCenterCategoryId,
          vatRate: o.vatRate,
          vatIncluded: o.vatIncluded,
        });
        return;
      }

      const key = normalizeBankDescription(movement.description);
      const source = key ? recurringIndex.get(key) : undefined;
      // Repetir uma classificação: mesma descrição (nome) e mesmo valor (± 1 €). Valores que variam
      // (taxas TPA…) ficam para os «movimentos recorrentes» (regras), que aceitam qualquer valor.
      if (source && source.justificationType && Math.abs(source.amount - movement.amount) <= AMOUNT_MATCH_TOLERANCE_CENTS) {
        repeatJustifications.push({
          movementId: movement.id,
          sourceMovementId: source.id,
          sourceDescription: source.description,
          sourceDate: source.bookingDate.toISOString().slice(0, 10),
          justificationType: source.justificationType,
          costCenterGroupId: source.costCenterGroupId,
          costCenterCategoryId: source.costCenterCategoryId,
          supplierId: source.supplierId,
          notes: source.notes,
          riskLevel: source.riskLevel,
          vatRate: source.vatRate,
          vatIncluded: source.vatIncluded,
        });
      }
    });

    return { entityMatches, occurrenceMatches, repeatJustifications };
  }
}
