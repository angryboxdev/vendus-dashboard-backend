import type { Invoice } from "../entities/invoice.js";
import { normalizeNif } from "./nif.js";

/**
 * Chave de deduplicação: fornecedor (supplierId quando ligado; caso
 * contrário o NIF normalizado extraído na fatura) + número de fatura
 * normalizado (trim + maiúsculas). Faturas sem nenhuma âncora de fornecedor
 * ficam de fora — não há como confirmar que são do mesmo emissor.
 */
function duplicateKey(invoice: Invoice): string | null {
  const supplierKey = invoice.supplierId ?? (invoice.supplierNifSnapshot ? normalizeNif(invoice.supplierNifSnapshot) : null);
  if (!supplierKey) return null;
  const invoiceNumberKey = invoice.invoiceNumber.trim().toUpperCase();
  if (!invoiceNumberKey) return null;
  return `${supplierKey}::${invoiceNumberKey}`;
}

/**
 * IDs das faturas não canceladas que partilham fornecedor + número com pelo
 * menos outra fatura da lista recebida. Calculado a cada listagem (não
 * persistido) para nunca ficar desatualizado quando uma fatura duplicada é
 * cancelada ou o número é corrigido.
 */
export function findDuplicateInvoiceIds(invoices: Invoice[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const invoice of invoices) {
    if (invoice.status === "cancelled") continue;
    const key = duplicateKey(invoice);
    if (!key) continue;
    const ids = groups.get(key) ?? [];
    ids.push(invoice.id);
    groups.set(key, ids);
  }

  const duplicateIds = new Set<string>();
  for (const ids of groups.values()) {
    if (ids.length > 1) {
      for (const id of ids) duplicateIds.add(id);
    }
  }
  return duplicateIds;
}

/**
 * IDs das faturas não canceladas do mesmo fornecedor com a mesma data, o
 * mesmo total e o mesmo tipo de documento, mas com números diferentes —
 * normalmente a mesma fatura importada duas vezes com o número mal lido.
 * Só um aviso («possível duplicada»): o utilizador compara e decide.
 */
export function findPossibleDuplicateInvoiceIds(invoices: Invoice[]): Set<string> {
  const groups = new Map<string, Invoice[]>();
  for (const invoice of invoices) {
    if (invoice.status === "cancelled" || !invoice.totalWithVat) continue;
    const supplierKey = invoice.supplierId ?? (invoice.supplierNifSnapshot ? normalizeNif(invoice.supplierNifSnapshot) : null);
    if (!supplierKey) continue;
    const key = `${supplierKey}::${invoice.invoiceDate.toISOString().slice(0, 10)}::${invoice.totalWithVat}::${invoice.documentType}`;
    groups.set(key, [...(groups.get(key) ?? []), invoice]);
  }

  const ids = new Set<string>();
  for (const group of groups.values()) {
    const numbers = new Set(group.map((i) => i.invoiceNumber.trim().toUpperCase()));
    if (group.length > 1 && numbers.size > 1) for (const i of group) ids.add(i.id);
  }
  return ids;
}
