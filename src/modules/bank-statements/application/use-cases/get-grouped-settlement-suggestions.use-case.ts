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

    // ── 2b. Documento de pagamento com várias faturas fiscais (ex.: águas: água/saneamento +
    // resíduos, dois emitentes, um só débito). A procura por fornecedor nunca as junta; aqui
    // sugerem-se as faturas do mesmo documento cuja soma em aberto bate exatamente com o movimento.
    const documentCombinations = await this.paymentDocumentCombinations(organizationId, movementId, movement);
    if (documentCombinations.length) {
      const names = [...new Set(documentCombinations[0]!.docs.map((d) => d.entityLabel.split(" — ")[0]))];
      return {
        movementId,
        movementAmountCents: movement.amount,
        currency: movement.currency,
        supplierId: null,
        supplierName: names.join(" + "),
        singleExactMatch: null,
        primaryCombination: documentCombinations[0]!,
        alternateCombinations: documentCombinations.slice(1),
        eligibleDocuments: documentCombinations.flatMap((c) => c.docs),
        totalEligibleBeforeCap: documentCombinations.reduce((n, c) => n + c.documentCount, 0),
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

  /**
   * Documentos de pagamento (faturas com o mesmo `paymentGroupId`) cuja soma em aberto — sem as
   * alocações deste próprio movimento, a mesma convenção do RPC — é exatamente o valor do
   * movimento. Todas as faturas do documento têm de estar em aberto. Mais perto da data primeiro.
   */
  private async paymentDocumentCombinations(
    organizationId: GetGroupedSettlementSuggestionsQuery["organizationId"],
    movementId: string,
    movement: { amount: number; currency: string; bookingDate: Date },
  ): Promise<GroupedSettlementCombinationDto[]> {
    const day = 86_400_000;
    const movementTime = new Date(toYMD(movement.bookingDate) + "T00:00:00.000Z").getTime();
    const docs = await this.invoiceRead.findPaymentGroupDocuments(organizationId, {
      currency: movement.currency,
      dateFrom: toYMD(new Date(movementTime - PAYMENT_DOCUMENT_WINDOW_DAYS * day)),
      dateTo: toYMD(new Date(movementTime + PAYMENT_DOCUMENT_WINDOW_DAYS * day)),
    });
    if (!docs.length) return [];

    const links = await this.linkRepo.findByEntityIds(organizationId, "invoice", docs.map((d) => d.id));
    const alloc = new Map<string, number>();
    for (const l of links) {
      if (l.movementId === movementId) continue;
      alloc.set(l.entityId, (alloc.get(l.entityId) ?? 0) + l.allocatedAmountCents);
    }

    const byGroup = new Map<string, InvoiceMatchCandidate[]>();
    for (const d of docs) if (d.paymentGroupId) byGroup.set(d.paymentGroupId, [...(byGroup.get(d.paymentGroupId) ?? []), d]);

    const combos: { combo: GroupedSettlementCombinationDto; distance: number }[] = [];
    for (const [paymentGroupId, members] of byGroup) {
      if (members.length < 2) continue;
      const open = members.map((m) => ({ m, openBalanceCents: m.totalWithVat - (alloc.get(m.id) ?? 0) }));
      if (open.some((o) => o.openBalanceCents <= 0)) continue;
      const total = open.reduce((s, o) => s + o.openBalanceCents, 0);
      if (total !== movement.amount) continue;
      const docDtos: GroupedSettlementDocDto[] = open.map(({ m, openBalanceCents }) => {
        const bestDate = m.dueDate ?? m.invoiceDate;
        return {
          entityId: m.id,
          documentType: m.documentType,
          entityLabel: `${m.supplierName} — ${m.invoiceNumber}`,
          supplierId: m.supplierId,
          openBalanceCents,
          invoiceDate: m.invoiceDate,
          dueDate: m.dueDate,
          isOverdue: m.status === "overdue",
          isBeforeMovementDate: new Date(bestDate + "T00:00:00.000Z").getTime() <= movementTime,
        };
      });
      const bestDate = members[0]!.dueDate ?? members[0]!.invoiceDate;
      combos.push({
        combo: {
          docs: docDtos,
          documentCount: docDtos.length,
          invoiceCount: docDtos.filter((d) => d.documentType === "invoice").length,
          creditNoteCount: docDtos.filter((d) => d.documentType === "credit_note").length,
          invoiceTotalCents: total,
          creditNoteTotalCents: 0,
          netTotalCents: total,
          isExactMatch: true,
          paymentGroupId,
        },
        distance: Math.abs(new Date(bestDate + "T00:00:00.000Z").getTime() - movementTime),
      });
    }
    return combos.sort((a, b) => a.distance - b.distance).map((c) => c.combo);
  }
}

/** Janela (dias, para cada lado do débito) em que se procuram documentos de pagamento. */
const PAYMENT_DOCUMENT_WINDOW_DAYS = 45;
