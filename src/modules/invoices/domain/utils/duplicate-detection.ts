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
