export type ContentUnit = "g" | "kg" | "ml" | "cl" | "l" | "un";
/** A fatura conta embalagens («4,000» sacos) ou o conteúdo («20,000» kg). */
export type InvoicedBy = "package" | "content";

/**
 * Contas da apresentação de compra (sem I/O). Só converte entre unidades da mesma dimensão
 * (massa g/kg, volume ml/cl/l, unidades); dimensões diferentes → «Embalagem por configurar».
 * A quantidade faturada nunca é arredondada; só a encomenda sugerida é arredondada para cima.
 */

type Dimension = "mass" | "volume" | "count";
const UNITS: Record<string, { dimension: Dimension; toSmallest: number }> = {
  g: { dimension: "mass", toSmallest: 1 },
  kg: { dimension: "mass", toSmallest: 1000 },
  ml: { dimension: "volume", toSmallest: 1 },
  cl: { dimension: "volume", toSmallest: 10 },
  l: { dimension: "volume", toSmallest: 1000 },
  un: { dimension: "count", toSmallest: 1 },
  und: { dimension: "count", toSmallest: 1 },
};

const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/** Fator de `from` para `to` (ex.: kg → g = 1000); null se as dimensões não batem. */
export function unitFactor(from: string, to: string): number | null {
  const a = UNITS[from.trim().toLowerCase()], b = UNITS[to.trim().toLowerCase()];
  if (!a || !b || a.dimension !== b.dimension) return null;
  return round6(a.toSmallest / b.toSmallest);
}

export interface PresentationShape {
  packageUnit: string | null;
  contentQuantity: number;
  contentUnit: ContentUnit;
  invoicedBy: InvoicedBy;
  minOrderPackages: number;
  orderIncrementPackages: number;
}

export interface InvoiceLineToStock {
  /** Unidades base de Stock por unidade faturada (o fator da resolução da linha). */
  conversionFactor: number;
  /** Quantidade que entra no Stock, na unidade base do artigo. */
  stockQuantity: number;
  /** Embalagens equivalentes (8 sacos); null sem embalagem. */
  packages: number | null;
  /** Custo líquido sem IVA por unidade base, por unidade do conteúdo (€/kg) e por embalagem (cêntimos). */
  netCostPerBaseUnit: number;
  netCostPerContentUnit: number;
  netCostPerPackage: number | null;
}

/**
 * Linha da fatura → Stock: 20 kg (fatura em kg) com saco de 2,5 kg e artigo em g → fator 1000,
 * +20 000 g, 8 sacos, 5,58 €/kg, 13,95 €/saco. 4 sacos (fatura em sacos) de 5 kg, artigo em kg →
 * fator 5, +20 kg. Null quando o conteúdo não se converte na unidade base do artigo.
 */
export function invoiceLineToStock(p: PresentationShape, invoicedQuantity: number, lineNetCents: number, baseUnit: string): InvoiceLineToStock | null {
  const contentToBase = unitFactor(p.contentUnit, baseUnit);
  if (contentToBase === null || !(invoicedQuantity > 0)) return null;
  const conversionFactor = p.invoicedBy === "package" ? round6(p.contentQuantity * contentToBase) : contentToBase;
  const stockQuantity = round6(invoicedQuantity * conversionFactor);
  const contentQuantity = p.invoicedBy === "package" ? invoicedQuantity * p.contentQuantity : invoicedQuantity;
  const packages = p.packageUnit ? round6(p.invoicedBy === "package" ? invoicedQuantity : invoicedQuantity / p.contentQuantity) : null;
  return {
    conversionFactor,
    stockQuantity,
    packages,
    netCostPerBaseUnit: round6(lineNetCents / stockQuantity),
    netCostPerContentUnit: round6(lineNetCents / contentQuantity),
    netCostPerPackage: packages ? round6(lineNetCents / packages) : null,
  };
}

export interface OrderSuggestion {
  /** Embalagens a encomendar (inteiro de incrementos, ≥ mínimo); 0 sem necessidade. */
  packages: number;
  /** Quantidade que essas embalagens trazem, na unidade base. */
  quantityBase: number;
  /** Excedente sobre a necessidade, na unidade base. */
  surplusBase: number;
}

/**
 * Necessidade líquida → encomenda em embalagens inteiras: 12 kg com saco de 2,5 kg → 5 sacos
 * (12,5 kg, excedente 0,5 kg); 0,5 kg → 1 saco; 0 → 0. Arredonda sempre para cima, ao incremento,
 * e respeita o mínimo. Null se o conteúdo não se converte na unidade base.
 */
export function orderForNeed(p: PresentationShape, needBase: number, baseUnit: string): OrderSuggestion | null {
  const contentToBase = unitFactor(p.contentUnit, baseUnit);
  if (contentToBase === null) return null;
  if (!(needBase > 0)) return { packages: 0, quantityBase: 0, surplusBase: 0 };
  const perPackage = p.contentQuantity * contentToBase;
  const raw = needBase / perPackage;
  // Tolerância para não pedir um incremento a mais por erro de vírgula flutuante (12 / 2,5 = 4,8000000001).
  const steps = Math.ceil(raw / p.orderIncrementPackages - 1e-9);
  const packages = Math.max(p.minOrderPackages, round6(steps * p.orderIncrementPackages));
  const quantityBase = round6(packages * perPackage);
  return { packages, quantityBase, surplusBase: round6(quantityBase - needBase) };
}
