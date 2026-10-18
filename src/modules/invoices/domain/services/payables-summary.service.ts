/**
 * Resumo «Total a pagar | Em atraso» da barra de filtros de Faturas (F2 v1.2
 * §2.3). Função pura. Saldo aberto do razão (não o valor original): total da
 * obrigação − pagamentos reconhecidos (alocações bancárias da fatura e da sua
 * conta a pagar), nunca abaixo de zero; marcada como paga = 0. Notas de
 * crédito aplicadas já estão refletidas nas alocações (liquidação agrupada) —
 * não se subtraem outra vez; as ainda não aplicadas aparecem à parte.
 *
 * Em atraso = saldo aberto com vencimento ANTES da data civil de hoje da
 * entidade (vence hoje não está atrasado). Sem vencimento: conta na dívida e
 * é sinalizado. Garante 0 ≤ Em atraso ≤ Total a pagar.
 */

export interface LedgerDocument {
  id: string;
  kind: "invoice" | "obligation";
  documentType: "invoice" | "credit_note";
  /** Já liquidado por marcação (fatura «paga» ou conta a pagar «paga»). */
  settled: boolean;
  /** Magnitude do total, em cêntimos. */
  totalCents: number;
  /** Pagamentos reconhecidos (soma das alocações), magnitude em cêntimos. */
  allocatedCents: number;
  /** YYYY-MM-DD ou null. */
  dueDate: string | null;
  /** Data da listagem (a mesma do filtro de período): data da fatura; obrigações sem fatura usam o vencimento. */
  listingDate: string | null;
  currency: string;
  supplierId: string | null;
  /** Texto pesquisável (fornecedor, número, descrição). */
  searchText: string;
  /** Lojas das linhas/repartições do documento. */
  locationIds: Set<string>;
  /** Mais de uma obrigação ativa para a mesma fatura (suspeita, por validar). */
  duplicateWarning: boolean;
}

export interface PayablesSummaryFilter {
  search?: string;
  from?: string;
  to?: string;
  supplierId?: string;
  locationId?: string;
  currency?: string;
}

export interface PayablesSummary {
  currency: string;
  today: string;
  totalOpenCents: number;
  overdueCents: number;
  documents: number;
  missingDueDate: { count: number; cents: number };
  /** Com filtro de loja: documentos multiloja (o saldo mostrado é do documento, não da loja). */
  multiLocationDocuments: number;
  /** Suspeitas de duplicação por validar (o saldo registado mantém-se — sem corte automático). */
  suspectedDuplicates: number;
  /** Notas de crédito ainda não aplicadas (informativo; não abatido ao total). */
  unappliedCreditCents: number;
  /** Outras moedas presentes e não somadas (sem conversão autorizada). */
  otherCurrencies: string[];
}

/** Data civil (YYYY-MM-DD) num fuso horário IANA. */
export function civilDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function summarizePayables(docs: LedgerDocument[], filter: PayablesSummaryFilter, today: string): PayablesSummary {
  const currency = (filter.currency ?? "EUR").toUpperCase();
  const q = filter.search?.trim().toLowerCase() ?? "";
  const matches = (d: LedgerDocument) =>
    (!q || d.searchText.toLowerCase().includes(q)) &&
    (!filter.supplierId || d.supplierId === filter.supplierId) &&
    (!filter.from || (d.listingDate !== null && d.listingDate >= filter.from)) &&
    (!filter.to || (d.listingDate !== null && d.listingDate <= filter.to)) &&
    (!filter.locationId || d.locationIds.has(filter.locationId));

  const filtered = docs.filter(matches);
  const otherCurrencies = [...new Set(filtered.map((d) => d.currency.toUpperCase()).filter((c) => c !== currency))].sort();
  const result: PayablesSummary = {
    currency,
    today,
    totalOpenCents: 0,
    overdueCents: 0,
    documents: 0,
    missingDueDate: { count: 0, cents: 0 },
    multiLocationDocuments: 0,
    suspectedDuplicates: 0,
    unappliedCreditCents: 0,
    otherCurrencies,
  };
  for (const d of filtered) {
    if (d.currency.toUpperCase() !== currency) continue;
    const open = d.settled ? 0 : Math.max(0, d.totalCents - d.allocatedCents);
    if (open === 0) continue;
    if (d.documentType === "credit_note") {
      result.unappliedCreditCents += open;
      continue;
    }
    result.totalOpenCents += open;
    result.documents += 1;
    if (!d.dueDate) {
      result.missingDueDate.count += 1;
      result.missingDueDate.cents += open;
    } else if (d.dueDate < today) {
      result.overdueCents += open;
    }
    if (filter.locationId && d.locationIds.size > 1) result.multiLocationDocuments += 1;
    if (d.duplicateWarning) result.suspectedDuplicates += 1;
  }
  return result;
}
