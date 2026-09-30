import type { StockReviewPolicy } from "../../../financial-base/domain/entities/cost-center-category.js";
import type { DefaultStockPolicy } from "../../../financial-base/domain/entities/supplier.js";

export type StockReviewOverride = "auto" | "force_create" | "force_skip";
export type DecisionOutcome = "create" | "skip" | "unresolved";
export type DecisionSource = "override" | "category" | "supplier" | "unresolved";

export interface DecideStockReviewInput {
  override: StockReviewOverride;
  overrideReason: string | null;
  lineCategoryPolicies: StockReviewPolicy[];
  supplierDefaultPolicy: DefaultStockPolicy;
}

export interface DecideStockReviewResult {
  outcome: DecisionOutcome;
  source: DecisionSource;
  policyUsed: string;
}

/**
 * Secção 8 da task de integração Financeiro→Stock (Caso 1-5). Função pura,
 * sem I/O — nunca usa Centro de Custo (proibido explicitamente). Um
 * `force_skip` sem motivo, quando a categoria/fornecedor normalmente
 * geraria revisão, NUNCA é silenciosamente honrado: em vez de bloquear a
 * fatura (que nunca pode ficar bloqueada por causa do Stock), a decisão
 * degrada para `unresolved` — evita desativar stock por acidente sem
 * introduzir uma dependência síncrona do Financeiro no Stock.
 */
export function decideStockReview(input: DecideStockReviewInput): DecideStockReviewResult {
  const wouldNormallyCreate =
    input.lineCategoryPolicies.includes("CREATE_REVIEW") ||
    (input.lineCategoryPolicies.every((p) => p === "UNDEFINED") && input.supplierDefaultPolicy === "usually_creates_review");

  if (input.override !== "auto") {
    const hasReason = !!input.overrideReason && input.overrideReason.trim().length > 0;
    if (input.override === "force_skip" && wouldNormallyCreate && !hasReason) {
      return { outcome: "unresolved", source: "unresolved", policyUsed: "override_skip_without_reason" };
    }
    return {
      outcome: input.override === "force_create" ? "create" : "skip",
      source: "override",
      policyUsed: input.override,
    };
  }

  if (input.lineCategoryPolicies.includes("CREATE_REVIEW")) {
    return { outcome: "create", source: "category", policyUsed: "CREATE_REVIEW" };
  }

  const hasUndefinedCategory = input.lineCategoryPolicies.some((p) => p === "UNDEFINED");
  const allNoStockEffect = input.lineCategoryPolicies.length > 0 && input.lineCategoryPolicies.every((p) => p === "NO_STOCK_EFFECT");
  if (allNoStockEffect) {
    return { outcome: "skip", source: "category", policyUsed: "NO_STOCK_EFFECT" };
  }

  if (hasUndefinedCategory || input.lineCategoryPolicies.length === 0) {
    if (input.supplierDefaultPolicy === "usually_creates_review") {
      return { outcome: "create", source: "supplier", policyUsed: "usually_creates_review" };
    }
    if (input.supplierDefaultPolicy === "usually_skips_review") {
      return { outcome: "skip", source: "supplier", policyUsed: "usually_skips_review" };
    }
  }

  return { outcome: "unresolved", source: "unresolved", policyUsed: "no_signal" };
}
