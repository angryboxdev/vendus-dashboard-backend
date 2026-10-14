import type { StockReviewPolicy } from "../../../financial-base/domain/entities/cost-center-category.js";
import type { DefaultStockPolicy } from "../../../financial-base/domain/entities/supplier.js";

export type StockRoutingSource = "supplier_location" | "supplier" | "category" | "none";

export interface StockRoutingSuggestion {
  /** true = «Enviar para Stock» marcado; false = desmarcado; null = sem predefinição (escolher). */
  send: boolean | null;
  source: StockRoutingSource;
  /** Motivo discreto mostrado junto ao controlo. */
  reason: string;
  /** Política «Decidir no documento»: lançar exige escolha explícita (ausência ≠ «Não enviar»). */
  requiresDecision: boolean;
}

export interface SuggestStockRoutingInput {
  /** Exceção do fornecedor para a loja do documento (null = sem exceção). */
  locationPolicy: DefaultStockPolicy | null;
  supplierPolicy: DefaultStockPolicy | null;
  categoryPolicies: StockReviewPolicy[];
}

function fromPolicy(policy: DefaultStockPolicy, source: "supplier_location" | "supplier"): StockRoutingSuggestion | null {
  const who = source === "supplier_location" ? "Exceção desta loja no fornecedor" : "Predefinição do fornecedor";
  if (policy === "usually_creates_review") return { send: true, source, reason: `${who}: enviar por defeito`, requiresDecision: false };
  if (policy === "usually_skips_review") return { send: false, source, reason: `${who}: não enviar`, requiresDecision: false };
  if (policy === "decide_per_document") return { send: null, source, reason: `${who}: decidir no documento`, requiresDecision: true };
  return null; // inherit → segue a categoria
}

/**
 * Sugestão de «Enviar para Stock» (F2 v1.2 §2.1). Função pura. Prioridade:
 * exceção fornecedor/loja → política explícita do fornecedor → categoria
 * (CC compatível) → sem sinal. A escolha manual autorizada no lançamento
 * prevalece sempre sobre esta sugestão; uma exceção num documento não muda
 * regras futuras.
 */
export function suggestStockRouting(input: SuggestStockRoutingInput): StockRoutingSuggestion {
  const byLocation = input.locationPolicy ? fromPolicy(input.locationPolicy, "supplier_location") : null;
  if (byLocation) return byLocation;
  const bySupplier = input.supplierPolicy ? fromPolicy(input.supplierPolicy, "supplier") : null;
  if (bySupplier) return bySupplier;
  if (input.categoryPolicies.includes("CREATE_REVIEW")) {
    return { send: true, source: "category", reason: "A subcategoria tem impacto em stock (ex.: ingredientes)", requiresDecision: false };
  }
  if (input.categoryPolicies.length > 0 && input.categoryPolicies.every((p) => p === "NO_STOCK_EFFECT")) {
    return { send: false, source: "category", reason: "Subcategoria sem impacto em stock (ex.: energia, comunicações, serviços)", requiresDecision: false };
  }
  return { send: null, source: "none", reason: "Sem predefinição — escolha se envia para o Stock", requiresDecision: false };
}
