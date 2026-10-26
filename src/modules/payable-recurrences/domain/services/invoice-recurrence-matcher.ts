import type { Recurrence } from "../entities/recurrence.js";

/** O que a associação automática precisa de saber da fatura. */
export interface InvoiceMatchInput {
  supplierId: string | null;
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
}

/**
 * Recorrências ativas a que uma fatura pode pertencer: mesmo fornecedor e, como
 * desempate, a mesma sub-categoria e depois a mesma categoria (grupo do centro de
 * custo). Um filtro de categoria que deixasse zero candidatos é ignorado — a
 * categoria só desempata, não exclui.
 */
export function matchRecurrencesForInvoice(invoice: InvoiceMatchInput, recurrences: Recurrence[]): Recurrence[] {
  if (!invoice.supplierId) return [];
  let candidates = recurrences.filter((r) => r.status === "active" && r.supplierId === invoice.supplierId);
  if (candidates.length <= 1) return candidates;

  if (invoice.costCenterCategoryId) {
    const byCategory = candidates.filter((r) => r.costCenterCategoryId === invoice.costCenterCategoryId);
    if (byCategory.length > 0) candidates = byCategory;
  }
  if (candidates.length > 1 && invoice.costCenterGroupId) {
    const byGroup = candidates.filter((r) => r.costCenterId === invoice.costCenterGroupId);
    if (byGroup.length > 0) candidates = byGroup;
  }
  return candidates;
}

/**
 * Meses a tentar, por ordem: o da data de emissão e, se esse já não aceitar a
 * fatura, o anterior (ex.: luz de setembro faturada em outubro).
 */
export function candidateMonthsForInvoice(invoiceDate: string): { year: number; month: number }[] {
  const [y, m] = invoiceDate.slice(0, 7).split("-").map((n) => parseInt(n, 10)) as [number, number];
  const prev = m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
  return [{ year: y, month: m }, prev];
}
