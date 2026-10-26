import type { Recurrence } from "../entities/recurrence.js";

/** O que a associação automática precisa de saber da fatura. */
export interface InvoiceMatchInput {
  supplierId: string | null;
  supplierName: string;
  costCenterGroupId: string | null;
  costCenterCategoryId: string | null;
}

/**
 * Como a recorrência foi encontrada. O valor nunca entra (o previsto é estimado):
 * - `supplier` — mesmo fornecedor (pode associar sozinha);
 * - `category_name` — sem o mesmo fornecedor (ou a recorrência não tem), mas mesma
 *   categoria/sub-categoria E nome parecido (ex.: «Água» ↔ «Águas do Porto») — só sugere.
 */
export type RecurrenceMatchKind = "supplier" | "category_name";

export interface RecurrenceMatch {
  recurrence: Recurrence;
  matchedBy: RecurrenceMatchKind;
}

const STOP_WORDS = new Set(["lda", "sa", "unipessoal", "de", "do", "da", "dos", "das", "e", "em", "the", "sociedade", "empresa", "municipal", "portugal"]);

/** Palavras significativas, sem acentos, no singular aproximado (≥ 4 letras). */
function words(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w)),
  );
}

/** O nome da recorrência (ou o beneficiário que tem) partilha uma palavra significativa com o fornecedor da fatura. */
export function namesLookAlike(recurrence: Pick<Recurrence, "name" | "supplierName">, invoiceSupplierName: string): boolean {
  const invoiceWords = words(invoiceSupplierName);
  if (!invoiceWords.size) return false;
  for (const w of words(`${recurrence.name} ${recurrence.supplierName}`)) if (invoiceWords.has(w)) return true;
  return false;
}

/** Mesma sub-categoria (quando as duas têm) ou, senão, mesma categoria (quando as duas têm). */
function sameCategory(r: Recurrence, invoice: InvoiceMatchInput): boolean {
  if (r.costCenterCategoryId && invoice.costCenterCategoryId) return r.costCenterCategoryId === invoice.costCenterCategoryId;
  if (r.costCenterId && invoice.costCenterGroupId) return r.costCenterId === invoice.costCenterGroupId;
  return false;
}

/**
 * Recorrências ativas a que uma fatura pode pertencer — nunca pelo valor.
 * 1. Mesmo fornecedor: desempate pela sub-categoria e depois pela categoria (um filtro que
 *    deixasse zero candidatos é ignorado — a categoria só desempata).
 * 2. Sem nenhuma pelo fornecedor: as de mesma categoria/sub-categoria com nome parecido
 *    (ex.: recorrência «Água» sem fornecedor ↔ fatura «Águas do Porto»).
 */
export function matchRecurrencesForInvoice(invoice: InvoiceMatchInput, recurrences: Recurrence[]): RecurrenceMatch[] {
  const active = recurrences.filter((r) => r.status === "active");

  let bySupplier = invoice.supplierId ? active.filter((r) => r.supplierId === invoice.supplierId) : [];
  if (bySupplier.length > 1 && invoice.costCenterCategoryId) {
    const byCategory = bySupplier.filter((r) => r.costCenterCategoryId === invoice.costCenterCategoryId);
    if (byCategory.length > 0) bySupplier = byCategory;
  }
  if (bySupplier.length > 1 && invoice.costCenterGroupId) {
    const byGroup = bySupplier.filter((r) => r.costCenterId === invoice.costCenterGroupId);
    if (byGroup.length > 0) bySupplier = byGroup;
  }
  if (bySupplier.length) return bySupplier.map((recurrence) => ({ recurrence, matchedBy: "supplier" }));

  return active
    .filter((r) => sameCategory(r, invoice) && namesLookAlike(r, invoice.supplierName))
    .map((recurrence) => ({ recurrence, matchedBy: "category_name" }));
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
