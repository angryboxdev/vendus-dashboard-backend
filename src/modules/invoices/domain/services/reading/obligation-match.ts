import type { PaymentDocumentReading } from "../../entities/payment-document.js";

/**
 * Procura a mesma obrigação já registada (fatura ou conta a pagar) antes de
 * qualquer lançamento. Não depende só do número: leituras antigas por IA podem
 * ter trocado dígitos — por isso também valor + vencimento e números parecidos.
 * Só sugere; nunca liga nem cria nada sozinha.
 */

export interface ExistingObligation {
  source: "invoice" | "payable";
  id: string;
  /** Para contas a pagar: a fatura a que pertencem (evita mostrar a mesma obrigação duas vezes). */
  invoiceId: string | null;
  /** Número da fatura ou descrição da conta a pagar. */
  label: string;
  supplierName: string;
  amountCents: number;
  dueDate: string | null;
  documentDate: string | null;
  status: string;
}

export type ObligationMatchReason = "same_reference" | "same_document_number" | "similar_number" | "same_amount_and_due_date" | "same_amount_in_period";

export interface ObligationMatch {
  existing: ExistingObligation;
  reasons: ObligationMatchReason[];
  strength: "strong" | "possible";
}

const digitGroups = (s: string) => (s.match(/\d[\d.\s]*\d/g) ?? []).map((g) => g.replace(/\D/g, "")).filter((g) => g.length >= 6);

/** Distância de edição com troca de vizinhos (Damerau-Levenshtein restrita). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/** Data dentro do período (AAAA-MM) ou nos dois meses seguintes (prazo legal de pagamento). */
function inPeriodWindow(date: string | null, period: string | null): boolean {
  if (!date || !period) return false;
  const [y, m] = period.split("-").map(Number) as [number, number];
  const start = y * 12 + (m - 1);
  const [dy, dm] = date.slice(0, 7).split("-").map(Number) as [number, number];
  const at = dy * 12 + (dm - 1);
  return at >= start && at <= start + 2;
}

export function matchObligations(reading: PaymentDocumentReading, candidates: ExistingObligation[]): ObligationMatch[] {
  const keys = [reading.documentNumber, reading.paymentReference].filter((k): k is string => !!k);
  const out: ObligationMatch[] = [];
  for (const c of candidates) {
    if (c.status === "cancelled") continue;
    const reasons: ObligationMatchReason[] = [];
    const groups = digitGroups(c.label);
    if (reading.paymentReference && groups.includes(reading.paymentReference)) reasons.push("same_reference");
    if (reading.documentNumber && groups.includes(reading.documentNumber)) reasons.push("same_document_number");
    if (!reasons.length && keys.some((k) => groups.some((g) => g.length === k.length && editDistance(g, k) <= 2))) reasons.push("similar_number");
    const sameAmount = reading.totalCents !== null && c.amountCents === reading.totalCents;
    if (sameAmount && reading.dueDate && c.dueDate === reading.dueDate) reasons.push("same_amount_and_due_date");
    else if (sameAmount && (inPeriodWindow(c.documentDate, reading.period) || inPeriodWindow(c.dueDate, reading.period))) reasons.push("same_amount_in_period");
    if (!reasons.length) continue;
    const strong = reasons.includes("same_reference") || reasons.includes("same_document_number") || (sameAmount && (reasons.includes("similar_number") || reasons.includes("same_amount_and_due_date")));
    out.push({ existing: c, reasons, strength: strong ? "strong" : "possible" });
  }
  // A conta a pagar de uma fatura já encontrada é a mesma obrigação: mostra-se só a fatura.
  const invoiceIds = new Set(out.filter((m) => m.existing.source === "invoice").map((m) => m.existing.id));
  return out
    .filter((m) => !(m.existing.source === "payable" && m.existing.invoiceId && invoiceIds.has(m.existing.invoiceId)))
    .sort((a, b) => (a.strength === b.strength ? b.reasons.length - a.reasons.length : a.strength === "strong" ? -1 : 1));
}
