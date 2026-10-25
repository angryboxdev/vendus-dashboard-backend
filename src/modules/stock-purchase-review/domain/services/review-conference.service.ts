import type { StockReviewPolicy } from "../../../financial-base/domain/entities/cost-center-category.js";
import type { CategoryDivergence } from "../entities/stock-purchase-review.js";
import type { ResolutionType } from "../entities/stock-review-line.js";

export interface ConferenceLineInput {
  id: string;
  description: string;
  totalWithVat: number;
  vatAmount: number | null;
  resolutionType: ResolutionType;
  costCenterCategoryId: string | null;
}

export interface ConferenceInput {
  invoiceNetCents: number | null;
  invoiceVatCents: number | null;
  invoiceTotalCents: number | null;
  lines: ConferenceLineInput[];
  /** Política de Stock de cada categoria financeira usada nas linhas (do catálogo real). */
  categoryPolicies: ReadonlyMap<string, StockReviewPolicy>;
}

export interface DocumentConference {
  /** `unavailable` = revisão anterior à F3a (sem totais/IVA por linha guardados) — não bloqueia. */
  status: "ok" | "mismatch" | "unavailable";
  linesNetCents: number | null;
  linesVatCents: number | null;
  invoiceNetCents: number | null;
  invoiceVatCents: number | null;
  invoiceTotalCents: number | null;
  netDifferenceCents: number | null;
  vatDifferenceCents: number | null;
}

export interface StockConference {
  inventoriableLines: number;
  nonStockLines: number;
  unresolvedLines: number;
  /** Base líquida das linhas inventariáveis — não precisa de somar o total financeiro. */
  inventoriableNetCents: number | null;
  nonStockNetCents: number | null;
}

export interface ReviewConference {
  document: DocumentConference;
  stock: StockConference;
  categories: { divergences: CategoryDivergence[] };
}

const isInventoriable = (t: ResolutionType) => t === "existing_item" || t === "new_item";

/**
 * Três conferências separadas da F3a (task v1.2 §3.1), sem I/O:
 * 1. Documento — todas as linhas (incluindo as não inventariáveis) batem com base e IVA da fatura.
 * 2. Stock — só as linhas inventariáveis geram quantidade e custo.
 * 3. Categorias — a categoria financeira da linha contra o tratamento de Stock; divergência é
 *    pendência para o Financeiro, nunca bloqueia nem redistribui valores.
 */
export function computeReviewConference(input: ConferenceInput): ReviewConference {
  const net = (l: ConferenceLineInput) => (l.vatAmount === null ? null : Math.round(l.totalWithVat - l.vatAmount));
  const allHaveVat = input.lines.every((l) => l.vatAmount !== null);
  const sum = (lines: ConferenceLineInput[], f: (l: ConferenceLineInput) => number) => lines.reduce((acc, l) => acc + f(l), 0);

  const linesNetCents = allHaveVat ? sum(input.lines, (l) => net(l)!) : null;
  const linesVatCents = allHaveVat ? sum(input.lines, (l) => Math.round(l.vatAmount!)) : null;
  const available = linesNetCents !== null && input.invoiceNetCents !== null && input.invoiceVatCents !== null;
  const netDifferenceCents = available ? linesNetCents - input.invoiceNetCents! : null;
  const vatDifferenceCents = available ? linesVatCents! - input.invoiceVatCents! : null;

  const inventoriable = input.lines.filter((l) => isInventoriable(l.resolutionType));
  const nonStock = input.lines.filter((l) => l.resolutionType === "no_stock_effect");

  const divergences: CategoryDivergence[] = [];
  for (const l of input.lines) {
    if (!l.costCenterCategoryId || l.resolutionType === "unresolved") continue;
    const policy = input.categoryPolicies.get(l.costCenterCategoryId);
    if (policy === "NO_STOCK_EFFECT" && isInventoriable(l.resolutionType)) {
      divergences.push({ lineId: l.id, description: l.description, costCenterCategoryId: l.costCenterCategoryId, kind: "stock_line_in_non_stock_category" });
    } else if (policy === "CREATE_REVIEW" && l.resolutionType === "no_stock_effect") {
      divergences.push({ lineId: l.id, description: l.description, costCenterCategoryId: l.costCenterCategoryId, kind: "non_stock_line_in_stock_category" });
    }
  }

  return {
    document: {
      status: !available ? "unavailable" : netDifferenceCents === 0 && vatDifferenceCents === 0 ? "ok" : "mismatch",
      linesNetCents,
      linesVatCents,
      invoiceNetCents: input.invoiceNetCents,
      invoiceVatCents: input.invoiceVatCents,
      invoiceTotalCents: input.invoiceTotalCents,
      netDifferenceCents,
      vatDifferenceCents,
    },
    stock: {
      inventoriableLines: inventoriable.length,
      nonStockLines: nonStock.length,
      unresolvedLines: input.lines.length - inventoriable.length - nonStock.length,
      inventoriableNetCents: allHaveVat ? sum(inventoriable, (l) => net(l)!) : null,
      nonStockNetCents: allHaveVat ? sum(nonStock, (l) => net(l)!) : null,
    },
    categories: { divergences },
  };
}
