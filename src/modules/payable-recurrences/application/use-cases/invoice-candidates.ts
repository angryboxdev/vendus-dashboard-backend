import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Recurrence } from "../../domain/entities/recurrence.js";
import type { RecurrenceOccurrence } from "../../domain/entities/recurrence-occurrence.js";
import type { InvoiceSnapshot } from "../../domain/ports/out/invoice-read.port.js";
import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { OccurrenceRepositoryPort } from "../../domain/ports/out/occurrence-repository.port.js";
import { OccurrenceGeneratorService } from "../../domain/services/occurrence-generator.service.js";
import { candidateMonthsForInvoice, matchRecurrencesForInvoice } from "../../domain/services/invoice-recurrence-matcher.js";

const generator = new OccurrenceGeneratorService();

export interface ResolvedInvoiceCandidate {
  recurrence: Recurrence;
  year: number;
  month: number;
  period: string;
  /** null = a ocorrência desse mês ainda não existe (gera-se só ao associar). */
  occurrence: RecurrenceOccurrence | null;
}

/** Estados em que a fatura já conta como lançada (rascunhos da IA e canceladas não). */
const LAUNCHED_STATUSES = new Set(["pending", "paid", "overdue"]);

/** Fatura que pode ser associada sozinha: lançada, com fornecedor, não é nota de crédito. */
export function isInvoiceEligibleForAutoLink(invoice: InvoiceSnapshot): boolean {
  return (
    invoice.supplierId !== null &&
    invoice.documentType !== "credit_note" &&
    invoice.totalWithVatCents > 0 &&
    LAUNCHED_STATUSES.has(invoice.status)
  );
}

/** A ocorrência a que alguma fatura do documento de pagamento já está ligada (o documento conta como um só). */
export async function findDocumentLink(
  organizationId: OrganizationId,
  members: InvoiceSnapshot[],
  occurrenceRepo: OccurrenceRepositoryPort,
): Promise<RecurrenceOccurrence | null> {
  for (const m of members) {
    const [linked] = await occurrenceRepo.findAll(organizationId, { invoiceId: m.id });
    if (linked) return linked;
  }
  return null;
}

/**
 * Para cada recorrência compatível com alguma fatura do documento (matcher — num documento de
 * pagamento das águas, a recorrência «Água» bate com o fornecedor da água, não com o dos resíduos),
 * o primeiro mês (emissão, depois o anterior) cuja ocorrência ainda aceita a fatura — ou que
 * ainda nem foi gerada. Não grava nada: gerar fica para o momento de associar.
 */
export async function resolveInvoiceCandidates(
  organizationId: OrganizationId,
  members: InvoiceSnapshot[],
  recurrenceRepo: RecurrenceRepositoryPort,
  occurrenceRepo: OccurrenceRepositoryPort,
): Promise<ResolvedInvoiceCandidate[]> {
  if (!members.length) return [];
  const active = await recurrenceRepo.findAll(organizationId, { status: "active" });
  const matched: Recurrence[] = [];
  for (const m of members) {
    for (const r of matchRecurrencesForInvoice(m, active)) if (!matched.some((x) => x.id === r.id)) matched.push(r);
  }
  const months = candidateMonthsForInvoice(members[0]!.invoiceDate);

  const out: ResolvedInvoiceCandidate[] = [];
  for (const recurrence of matched) {
    for (const { year, month } of months) {
      const period = generator.toPeriod(year, month);
      const existing = await occurrenceRepo.findByRecurrenceAndPeriod(organizationId, recurrence.id, period);
      if (existing) {
        if (existing.isOpenForInvoice()) {
          out.push({ recurrence, year, month, period, occurrence: existing });
          break;
        }
        continue;
      }
      if (generator.generateForMonth(recurrence, year, month)) {
        out.push({ recurrence, year, month, period, occurrence: null });
        break;
      }
    }
  }
  return out;
}

/** A ocorrência da recorrência nesse mês, gerada e gravada se ainda não existir; null fora de âmbito. */
export async function ensureOccurrence(
  organizationId: OrganizationId,
  recurrence: Recurrence,
  year: number,
  month: number,
  occurrenceRepo: OccurrenceRepositoryPort,
): Promise<RecurrenceOccurrence | null> {
  const period = generator.toPeriod(year, month);
  const existing = await occurrenceRepo.findByRecurrenceAndPeriod(organizationId, recurrence.id, period);
  if (existing) return existing;
  const generated = generator.generateForMonth(recurrence, year, month);
  if (!generated) return null;
  await occurrenceRepo.save(organizationId, generated);
  return generated;
}
