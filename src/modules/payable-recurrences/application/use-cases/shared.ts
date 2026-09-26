import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Recurrence } from "../../domain/entities/recurrence.js";
import { RecurrenceOccurrence, computeOccurrenceDisplayState } from "../../domain/entities/recurrence-occurrence.js";
import type { RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import type { OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";
import type { BankMovementLinkReadPort, LinkedBankMovement } from "../../domain/ports/out/bank-movement-link-read.port.js";
import type { InvoiceAllocatedAmountReadPort } from "../../domain/ports/out/invoice-allocated-amount-read.port.js";
import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import { OccurrenceGeneratorService } from "../../domain/services/occurrence-generator.service.js";

/** Serializes a Date to YYYY-MM-DD using local time (avoids UTC offset shifting the day). */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inverse of `toLocalDateString` — parses YYYY-MM-DD as a local calendar date (avoids the UTC-midnight parsing `new Date(string)` would do). */
export function fromLocalDateString(s: string): Date {
  const parts = s.split("-").map(Number);
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!);
}

export function toRecurrenceDTO(r: Recurrence): RecurrenceDTO {
  return {
    id: r.id,
    name: r.name,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    type: r.type,
    frequency: r.frequency,
    costCenterId: r.costCenterId,
    costCenterCategoryId: r.costCenterCategoryId,
    category: r.category,
    estimatedAmountCents: r.estimatedAmountCents,
    dayOfMonth: r.dayOfMonth,
    startDate: toLocalDateString(r.startDate),
    endDate: r.endDate ? toLocalDateString(r.endDate) : null,
    paymentMethod: r.paymentMethod,
    autoCreatePayable: r.autoCreatePayable,
    requireInvoice: r.requireInvoice,
    status: r.status,
    notes: r.notes,
    documentUrl: r.documentUrl,
    closedAt: r.closedAt ? toLocalDateString(r.closedAt) : null,
    vatRate: r.vatRate,
    vatIncluded: r.vatIncluded,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * `opts` carries whatever cross-module data the caller already resolved:
 *  - `linkedBankMovements`: fluxo B (sem fatura) — movimentos bancários
 *    ligados diretamente à ocorrência (pode ser mais de um — pagamentos
 *    parciais, spec §8).
 *  - `allocatedInvoiceAmountCents`: fluxo A (com fatura) — quanto já foi
 *    reconciliado no banco para a fatura vinculada (spec §3.A/§4). Ignorado
 *    quando a ocorrência não tem `invoiceId`.
 * Callers que não resolvem estes dados (ex: os que só mutam a ocorrência e
 * devolvem o DTO logo a seguir) ficam com paidAmountCents=0 — aceitável
 * porque o cálculo correcto acontece na próxima listagem/leitura.
 */
export function toOccurrenceDTO(
  o: RecurrenceOccurrence,
  opts: {
    linkedBankMovements?: LinkedBankMovement[] | undefined;
    allocatedInvoiceAmountCents?: number | undefined;
  } = {},
): OccurrenceDTO {
  const linkedBankMovements = o.invoiceId ? [] : (opts.linkedBankMovements ?? []);
  const paidAmountCents = o.invoiceId
    ? (opts.allocatedInvoiceAmountCents ?? 0)
    : linkedBankMovements.reduce((sum, m) => sum + m.amountCents, 0);

  return {
    id: o.id,
    recurrenceId: o.recurrenceId,
    period: o.period,
    estimatedAmountCents: o.estimatedAmountCents,
    realAmountCents: o.realAmountCents,
    effectiveAmountCents: o.effectiveAmountCents,
    dueDate: toLocalDateString(o.dueDate),
    status: o.status,
    requireInvoice: o.requireInvoice,
    invoiceId: o.invoiceId,
    paidAt: o.paidAt ? o.paidAt.toISOString() : null,
    paymentMethod: o.paymentMethod,
    paymentBankAccountId: o.paymentBankAccountId,
    paymentNotes: o.paymentNotes,
    notes: o.notes,
    documentUrl: o.documentUrl,
    linkedBankMovements,
    paidAmountCents,
    differenceCents: paidAmountCents - o.effectiveAmountCents,
    displayState: computeOccurrenceDisplayState(o, paidAmountCents),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/**
 * Batch version of `toOccurrenceDTO`: resolves linked bank movements (fluxo B)
 * and allocated invoice amounts (fluxo A) for a whole list of occurrences in
 * two queries, instead of one per occurrence. Shared by any use-case that
 * needs `paidAmountCents`/`differenceCents`/`displayState` for more than a
 * single occurrence (list-occurrences, get-monthly-summary).
 */
export async function enrichOccurrencesWithPayments(
  occurrences: RecurrenceOccurrence[],
  bankMovementLinkRead: BankMovementLinkReadPort,
  invoiceAllocatedAmountRead: InvoiceAllocatedAmountReadPort,
  organizationId: OrganizationId,
): Promise<OccurrenceDTO[]> {
  if (occurrences.length === 0) return [];

  const occurrenceIds = occurrences.map((o) => o.id);
  const invoiceIds = occurrences.map((o) => o.invoiceId).filter((id): id is string => id != null);

  const [bankLinks, allocatedAmounts] = await Promise.all([
    bankMovementLinkRead.findByOccurrenceIds(organizationId, occurrenceIds),
    invoiceAllocatedAmountRead.findAllocatedAmounts(organizationId, invoiceIds),
  ]);

  return occurrences.map((o) =>
    toOccurrenceDTO(o, {
      linkedBankMovements: bankLinks.get(o.id) ?? [],
      allocatedInvoiceAmountCents: o.invoiceId ? (allocatedAmounts.get(o.invoiceId) ?? 0) : undefined,
    }),
  );
}

const generator = new OccurrenceGeneratorService();

/**
 * Ensures every active recurrence has a persisted occurrence for the given
 * month — idempotent (checks `findByRecurrenceAndPeriod` before creating).
 * Generation is otherwise strictly on-demand/manual (no cron); this is what
 * lets a month actually be "used" (viewed, searched for reconciliation)
 * without someone having clicked "+ Gerar ocorrência" first. Shared by
 * `GenerateBatchOccurrencesUseCase` (manual trigger) and any read use-case
 * that needs the month's occurrences to really exist (get-monthly-summary,
 * list-occurrences-for-period).
 */
export async function ensureOccurrencesForPeriod(
  organizationId: OrganizationId,
  year: number,
  month: number,
  recurrenceRepo: RecurrenceRepositoryPort,
  occurrenceRepo: OccurrenceRepositoryPort,
): Promise<{ generated: RecurrenceOccurrence[]; skippedAlreadyExists: number; skippedOutOfScope: number }> {
  const period = generator.toPeriod(year, month);
  const activeRecurrences = await recurrenceRepo.findAll(organizationId, { status: "active" });

  const generated: RecurrenceOccurrence[] = [];
  let skippedAlreadyExists = 0;
  let skippedOutOfScope = 0;

  for (const recurrence of activeRecurrences) {
    const existing = await occurrenceRepo.findByRecurrenceAndPeriod(organizationId, recurrence.id, period);
    if (existing) {
      skippedAlreadyExists++;
      continue;
    }

    const occurrence = generator.generateForMonth(recurrence, year, month);
    if (!occurrence) {
      skippedOutOfScope++;
      continue;
    }

    await occurrenceRepo.save(organizationId, occurrence);
    generated.push(occurrence);
  }

  return { generated, skippedAlreadyExists, skippedOutOfScope };
}
