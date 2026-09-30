import { MovementNotFoundError } from "../../domain/errors.js";
import { normalizeBankDescription, supplierNameMatchesDescription } from "../../domain/utils/bank-description.js";
import {
  GroupedSettlementMatcherService,
  DEFAULT_MAX_CANDIDATES,
  type SettlementCandidate,
} from "../../domain/services/grouped-settlement-matcher.service.js";
import type { BankMovementRepositoryPort } from "../../domain/ports/out/bank-movement-repository.port.js";
import type { InvoiceMatchReadPort, InvoiceMatchCandidate } from "../../domain/ports/out/invoice-match-read.port.js";
import type { MovementMatchHintPort } from "../../domain/ports/out/movement-match-hint.port.js";
import type { BankMovementEntityLinkRepositoryPort } from "../../domain/ports/out/bank-movement-entity-link-repository.port.js";
import type { SupplierNameReadPort } from "../../domain/ports/out/supplier-name-read.port.js";
import type {
  FindMovementCandidatesPort,
  GetGroupedSettlementSuggestionsQuery,
  GetGroupedSettlementSuggestionsPort,
  GetGroupedSettlementSuggestionsResult,
  GroupedSettlementDocDto,
  GroupedSettlementCombinationDto,
} from "../../domain/ports/in/bank-statement.ports.js";

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * "Liquidação agrupada" — read-only suggestion engine. Nothing here is
 * persisted; applying a suggestion (or a manual selection) goes through
 * `ConfirmGroupedSettlementPort` exactly like the rest of this module's
 * suggestion endpoints (mirrors `GetMonthlySuggestionsUseCase`'s own
 * "read-only, nothing written" note).
 *
 * Reuses, rather than reimplements, everything the task says not to
 * duplicate:
 *  - `FindMovementCandidatesPort` for the simple 1:1 attempt AND as the
 *    first supplier-identification signal (its own scoring already blends
 *    the learning hint + supplier-name-in-description fallback — task
 *    section 4: no NEW supplier learning/scoring this round).
 *  - `MovementMatchHintPort` directly, as a stronger second signal when the
 *    single-candidate scoring didn't surface a confident invoice.
 *
 * Scope decision: the simple 1:1 short-circuit and the supplier-fallback
 * signal only ever look at `entityType === "invoice"` candidates.
 * `payable_entry` is a different domain concept (no currency column, not
 * grouped by supplier the same way) and stays out of "Liquidação agrupada"
 * entirely — this feature is invoices + credit notes only, per the task's
 * own vocabulary (faturas total / NC total / total líquido).
 */
export class GetGroupedSettlementSuggestionsUseCase implements GetGroupedSettlementSuggestionsPort {
  private readonly matcher = new GroupedSettlementMatcherService();

  constructor(
    private readonly movementRepo: BankMovementRepositoryPort,
    private readonly findMovementCandidates: FindMovementCandidatesPort,
    private readonly hint: MovementMatchHintPort,
    private readonly invoiceRead: InvoiceMatchReadPort,
    private readonly linkRepo: BankMovementEntityLinkRepositoryPort,
    private readonly supplierNameRead: SupplierNameReadPort
  ) {}

  async execute(query: GetGroupedSettlementSuggestionsQuery): Promise<GetGroupedSettlementSuggestionsResult> {
    const { organizationId, movementId } = query;
    const movement = await this.movementRepo.findById(organizationId, movementId);
    if (!movement) throw new MovementNotFoundError(movementId);

    const emptyResult = (supplierId: string | null, supplierName: string | null): GetGroupedSettlementSuggestionsResult => ({
      movementId,
      movementAmountCents: movement.amount,
      currency: movement.currency,
      supplierId,
      supplierName,
      singleExactMatch: null,
      primaryCombination: null,
      alternateCombinations: [],
      eligibleDocuments: [],
      totalEligibleBeforeCap: 0,
      candidatePoolCap: DEFAULT_MAX_CANDIDATES,
    });

    // ── 1. Try the simple 1:1 match first (task section 7) ───────────────────
    const singleCandidates = await this.findMovementCandidates.execute({ organizationId, movementId });
    const invoiceCandidates = singleCandidates.filter((c) => c.entityType === "invoice");

    const exactSingle = invoiceCandidates.find((c) => c.openBalanceCents === movement.amount) ?? null;

    // ── 2. Identify the supplier ──────────────────────────────────────────
    // Signal 1: a learned hint (exact single-match reconciliations only —
    // no new learning added here, task section 4). Signal 2: the top
    // amount-matched single candidate's own supplierId. Neither signal
    // fires in the exact scenario grouped settlement exists for: no single
    // document is close to the movement's amount, so `findMovementCandidates`
    // legitimately returns nothing to infer a supplier from. Signal 3
    // (below) is the fallback that actually covers that case: the same
    // word-substring heuristic already used elsewhere, applied directly
    // against every active supplier's name instead of only against
    // already-amount-matched candidates.
    const normalizedDesc = normalizeBankDescription(movement.description);
    const hintSupplierId = normalizedDesc.length > 0
      ? await this.hint.findSupplierByDescription(organizationId, normalizedDesc)
      : null;
    let supplierId = hintSupplierId ?? invoiceCandidates[0]?.supplierId ?? null;

    if (!supplierId && normalizedDesc.length > 0 && !exactSingle) {
      const suppliers = await this.supplierNameRead.listActive(organizationId);
      const matched = suppliers.find((s) => supplierNameMatchesDescription(s.name, normalizedDesc));
      supplierId = matched?.id ?? null;
    }

    if (exactSingle) {
      return {
        movementId,
        movementAmountCents: movement.amount,
        currency: movement.currency,
        supplierId: exactSingle.supplierId,
        supplierName: exactSingle.entityLabel.split(" — ")[0] ?? null,
        singleExactMatch: exactSingle,
        primaryCombination: null,
        alternateCombinations: [],
        eligibleDocuments: [],
        totalEligibleBeforeCap: 0,
        candidatePoolCap: DEFAULT_MAX_CANDIDATES,
      };
    }

    if (!supplierId) {
      return emptyResult(null, null);
    }

    // ── 3. Fetch the eligible pool for this supplier (invoices + credit notes) ─
    const maxDate = toYMD(movement.bookingDate);
    const pool = await this.invoiceRead.findBySupplier(organizationId, {
      supplierId,
      currency: movement.currency,
      maxDate,
    });

    if (pool.length === 0) {
      return emptyResult(supplierId, null);
    }

    const poolIds = pool.map((p) => p.id);
    const allLinks = await this.linkRepo.findByEntityIds(organizationId, "invoice", poolIds);

    // Open balance EXCLUDING this movement's own current links — the same
    // convention the RPC uses for its own revalidation, so what the caller
    // observes here is exactly what `expectedOpenBalanceCents` should carry.
    const allocExcludingThisMovement = new Map<string, number>();
    for (const l of allLinks) {
      if (l.movementId === movementId) continue;
      allocExcludingThisMovement.set(l.entityId, (allocExcludingThisMovement.get(l.entityId) ?? 0) + l.allocatedAmountCents);
    }

    const byId = new Map<string, InvoiceMatchCandidate>(pool.map((p) => [p.id, p]));
    const movementTime = new Date(maxDate + "T00:00:00.000Z").getTime();

    const eligible: Array<{ candidate: InvoiceMatchCandidate; openBalanceCents: number }> = [];
    for (const p of pool) {
      const openBalanceCents = p.totalWithVat - (allocExcludingThisMovement.get(p.id) ?? 0);
      if (openBalanceCents === 0) continue; // fully settled — never eligible again (task section 9)
      eligible.push({ candidate: p, openBalanceCents });
    }

    const toDto = (candidate: InvoiceMatchCandidate, openBalanceCents: number): GroupedSettlementDocDto => {
      const bestDate = candidate.dueDate ?? candidate.invoiceDate;
      return {
        entityId: candidate.id,
        documentType: candidate.documentType,
        entityLabel: `${candidate.supplierName} — ${candidate.invoiceNumber}`,
        supplierId: candidate.supplierId,
        openBalanceCents,
        invoiceDate: candidate.invoiceDate,
        dueDate: candidate.dueDate,
        isOverdue: candidate.status === "overdue",
        isBeforeMovementDate: new Date(bestDate + "T00:00:00.000Z").getTime() <= movementTime,
      };
    };

    const eligibleDocuments = eligible.map(({ candidate, openBalanceCents }) => toDto(candidate, openBalanceCents));

    const settlementCandidates: SettlementCandidate[] = eligible.map(({ candidate, openBalanceCents }) => ({
      entityId: candidate.id,
      documentType: candidate.documentType,
      openBalanceCents,
      invoiceDate: candidate.invoiceDate,
      dueDate: candidate.dueDate,
      isOverdue: candidate.status === "overdue",
    }));

    const matchResult = this.matcher.findExactCombinations({
      candidates: settlementCandidates,
      targetAbsCents: movement.amount,
      movementDate: maxDate,
    });

    const toCombinationDto = (docs: SettlementCandidate[]): GroupedSettlementCombinationDto => {
      const docDtos = docs.map((d) => {
        const candidate = byId.get(d.entityId)!;
        return toDto(candidate, d.openBalanceCents);
      });
      const invoiceTotalCents = docs.filter((d) => d.openBalanceCents > 0).reduce((s, d) => s + d.openBalanceCents, 0);
      const creditNoteTotalCents = docs.filter((d) => d.openBalanceCents < 0).reduce((s, d) => s + d.openBalanceCents, 0);
      return {
        docs: docDtos,
        documentCount: docs.length,
        invoiceCount: docs.filter((d) => d.documentType === "invoice").length,
        creditNoteCount: docs.filter((d) => d.documentType === "credit_note").length,
        invoiceTotalCents,
        creditNoteTotalCents,
        netTotalCents: invoiceTotalCents + creditNoteTotalCents,
        isExactMatch: true,
      };
    };

    const combinationDtos = matchResult.combinations.map((c) => toCombinationDto(c.candidates));

    return {
      movementId,
      movementAmountCents: movement.amount,
      currency: movement.currency,
      supplierId,
      supplierName: pool[0]?.supplierName ?? null,
      singleExactMatch: null,
      primaryCombination: combinationDtos[0] ?? null,
      alternateCombinations: combinationDtos.slice(1),
      eligibleDocuments,
      totalEligibleBeforeCap: matchResult.totalEligibleCount,
      candidatePoolCap: DEFAULT_MAX_CANDIDATES,
    };
  }
}
