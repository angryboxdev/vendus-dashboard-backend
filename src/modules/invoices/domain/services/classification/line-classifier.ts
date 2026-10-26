import { KEYWORD_RULES, normalizeDescription, type KeywordRule } from "./keyword-rules.js";

/**
 * Classificação de cada linha real numa subcategoria do catálogo DA ORGANIZAÇÃO
 * (Categoria → Subcategoria). Ordem: tipo da linha (depósito) → decisões já
 * confirmadas para o mesmo fornecedor (código do artigo, depois descrição) →
 * palavras-chave → (IA, fora daqui) → «precisa de atenção». Sempre sugestão
 * com origem e evidência; nunca IDs que não existam no catálogo; sem
 * percentagens de confiança inventadas.
 */

export interface CatalogEntry {
  id: string;
  code: string;
  name: string;
  groupName: string;
  isActive: boolean;
}

/** Linha de uma fatura já confirmada (não rascunho) do mesmo fornecedor. */
export interface ConfirmedLine {
  supplierCode: string | null;
  description: string;
  categoryId: string;
}

export interface LineToClassify {
  index: number;
  kind: "product" | "deposit";
  supplierCode: string | null;
  description: string;
}

export type ClassificationSource =
  | "line_kind"
  | "history_code"
  | "history_description"
  | "keyword"
  | "ai"
  /** Sem regra/histórico/IA: categoria por defeito da ficha do fornecedor. */
  | "supplier_default"
  /** Sem regra/histórico/IA nem categoria do fornecedor: sub-categoria das recorrências deste fornecedor. */
  | "recurrence"
  | "none";

export interface LineClassification {
  index: number;
  categoryId: string | null;
  source: ClassificationSource;
  evidence: string;
  /** Histórico em conflito: não se aplica nada automaticamente (nem IA) — decisão humana. */
  conflict?: true;
}

const DEPOSIT_CODE = "FDR.05";

/** Mapa chave → subcategoria, só quando o histórico é unânime (conflito = sem decisão). */
function unanimous(entries: [string, string][]): { decided: Map<string, string>; conflicts: Set<string> } {
  const seen = new Map<string, Set<string>>();
  for (const [k, cat] of entries) {
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k)!.add(cat);
  }
  const decided = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const [k, cats] of seen) {
    if (cats.size === 1) decided.set(k, [...cats][0]!);
    else conflicts.add(k);
  }
  return { decided, conflicts };
}

export function classifyLinesDeterministic(input: {
  lines: LineToClassify[];
  catalog: CatalogEntry[];
  history: ConfirmedLine[];
  rules?: KeywordRule[];
}): LineClassification[] {
  const active = input.catalog.filter((c) => c.isActive);
  const byCode = new Map(active.map((c) => [c.code, c]));
  const activeIds = new Set(active.map((c) => c.id));
  const history = input.history.filter((h) => activeIds.has(h.categoryId));
  const byItem = unanimous(history.filter((h) => h.supplierCode).map((h) => [h.supplierCode!, h.categoryId]));
  const byDesc = unanimous(history.map((h) => [normalizeDescription(h.description), h.categoryId]));
  const rules = input.rules ?? KEYWORD_RULES;
  const label = (id: string) => {
    const c = active.find((x) => x.id === id)!;
    return `${c.groupName} › ${c.name}`;
  };

  return input.lines.map((l): LineClassification => {
    if (l.kind === "deposit" && byCode.has(DEPOSIT_CODE)) {
      return { index: l.index, categoryId: byCode.get(DEPOSIT_CODE)!.id, source: "line_kind", evidence: "Linha de depósito/caução do documento." };
    }
    const notes: string[] = [];
    if (l.supplierCode) {
      const id = byItem.decided.get(l.supplierCode);
      if (id) return { index: l.index, categoryId: id, source: "history_code", evidence: `Referência ${l.supplierCode} já classificada como ${label(id)} em faturas confirmadas.` };
      if (byItem.conflicts.has(l.supplierCode)) notes.push(`referência ${l.supplierCode} com classificações diferentes no histórico`);
    }
    const desc = normalizeDescription(l.description);
    const id = byDesc.decided.get(desc);
    if (id) return { index: l.index, categoryId: id, source: "history_description", evidence: `Mesma descrição já classificada como ${label(id)} em faturas confirmadas.` };
    if (byDesc.conflicts.has(desc)) notes.push("descrição com classificações diferentes no histórico");
    if (!notes.length) {
      for (const r of rules) {
        const cat = byCode.get(r.categoryCode);
        const m = cat ? r.pattern.exec(desc) : null;
        if (cat && m) return { index: l.index, categoryId: cat.id, source: "keyword", evidence: `«${m[0]}» → ${r.label}.` };
      }
    }
    if (notes.length) return { index: l.index, categoryId: null, source: "none", evidence: `Sem decisão: ${notes.join("; ")}.`, conflict: true };
    return { index: l.index, categoryId: null, source: "none", evidence: "Sem regra nem histórico para esta descrição." };
  });
}
