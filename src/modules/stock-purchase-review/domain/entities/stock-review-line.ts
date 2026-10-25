import { InactiveStockItemReferencedError, InvalidConversionFactorError, InvalidReviewLineResolutionError } from "../errors.js";

export type ResolutionType = "unresolved" | "existing_item" | "new_item" | "no_stock_effect";

export const RESOLUTION_TYPES: ResolutionType[] = ["unresolved", "existing_item", "new_item", "no_stock_effect"];

/** Divisão de uma linha por lojas (F3a): quantidades explícitas na unidade de compra, cuja soma iguala a da linha. */
export interface LocationSplit {
  locationId: string;
  purchaseQuantity: number;
}

const QUANTITY_TOLERANCE = 0.000001;

/**
 * Conciliação proposta (F3b) — gravada para não repetir IA a cada abertura. Nunca resolve a
 * linha sozinha: `source: "none"` = procurou-se e não houve sugestão.
 */
export interface LineSuggestion {
  source: "learned" | "name_match" | "ai" | "none";
  resolution: "existing_item" | "no_stock_effect" | null;
  stockItemId: string | null;
  conversionFactor: number | null;
  /** 0..1 */
  confidence: number | null;
  /** A unidade da linha difere da aprendida — o fator antigo não serve. */
  packagingChanged: boolean;
  suggestedAt: Date;
}

interface StockReviewLineProps {
  id: string;
  organizationId: string;
  reviewId: string;
  invoiceLineId: string;
  description: string;
  purchaseQuantity: number;
  purchaseUnit: string;
  unitCostWithoutVat: number;
  totalWithVat: number;
  /** IVA da linha (mesma unidade de `totalWithVat`); líquido com descontos = total − IVA. Null em revisões anteriores à F3a. */
  vatAmount: number | null;
  supplierItemCode: string | null;
  /** Categoria financeira da linha (snapshot) — só para a conferência de categorias, nunca decide nada sozinha. */
  costCenterCategoryId: string | null;
  locationSplits: LocationSplit[] | null;
  suggestion: LineSuggestion | null;
  resolutionType: ResolutionType;
  stockItemId: string | null;
  conversionFactor: number | null;
  stockQuantity: number | null;
  locationId: string | null;
  unitCostPerBaseUnitWithVat: number | null;
  unitCostPerBaseUnitWithoutVat: number | null;
  flaggedSuspiciousConversion: boolean;
  flagReason: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface CreateStockReviewLineProps {
  organizationId: string;
  reviewId: string;
  invoiceLineId: string;
  description: string;
  purchaseQuantity: number;
  purchaseUnit: string;
  unitCostWithoutVat: number;
  totalWithVat: number;
  vatAmount?: number | null;
  supplierItemCode?: string | null;
  costCenterCategoryId?: string | null;
  locationId?: string | null;
}

export interface ResolveAsExistingOrNewItemData {
  stockItemId: string;
  conversionFactor: number;
  locationId?: string | null;
  /** ≥ 2 lojas, quantidades explícitas; nunca replicar a quantidade integral em cada loja. */
  locationSplits?: LocationSplit[] | null;
  isItemActive: boolean;
  flaggedSuspiciousConversion?: boolean;
  flagReason?: string | null;
}

function assertFiniteQuantity(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidReviewLineResolutionError(`${label} tem de ser um número positivo e finito`);
  }
}

export class StockReviewLine {
  private constructor(private readonly props: StockReviewLineProps) {}

  static create(props: CreateStockReviewLineProps): StockReviewLine {
    assertFiniteQuantity(props.purchaseQuantity, "purchaseQuantity");
    return new StockReviewLine({
      id: crypto.randomUUID(),
      organizationId: props.organizationId,
      reviewId: props.reviewId,
      invoiceLineId: props.invoiceLineId,
      description: props.description,
      purchaseQuantity: props.purchaseQuantity,
      purchaseUnit: props.purchaseUnit,
      unitCostWithoutVat: props.unitCostWithoutVat,
      totalWithVat: props.totalWithVat,
      vatAmount: props.vatAmount ?? null,
      supplierItemCode: props.supplierItemCode ?? null,
      costCenterCategoryId: props.costCenterCategoryId ?? null,
      locationSplits: null,
      suggestion: null,
      resolutionType: "unresolved",
      stockItemId: null,
      conversionFactor: null,
      stockQuantity: null,
      locationId: props.locationId ?? null,
      unitCostPerBaseUnitWithVat: null,
      unitCostPerBaseUnitWithoutVat: null,
      flaggedSuspiciousConversion: false,
      flagReason: null,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: StockReviewLineProps): StockReviewLine {
    return new StockReviewLine(props);
  }

  /** `existing_item`/`new_item` — mapeia para um item de stock (novo ou já existente) com a conversão calculada. */
  resolveToStockItem(data: ResolveAsExistingOrNewItemData, isNewItem: boolean, resolvedBy: string): StockReviewLine {
    if (!Number.isFinite(data.conversionFactor) || data.conversionFactor <= 0) {
      throw new InvalidConversionFactorError(data.conversionFactor);
    }
    if (!data.isItemActive) {
      throw new InactiveStockItemReferencedError(data.stockItemId);
    }
    const splits = data.locationSplits && data.locationSplits.length > 0 ? this.validateSplits(data.locationSplits) : null;
    const stockQuantity = this.props.purchaseQuantity * data.conversionFactor;
    const baseQuantity = stockQuantity;
    let unitCostPerBaseUnitWithoutVat: number;
    let unitCostPerBaseUnitWithVat: number;
    if (this.props.vatAmount !== null) {
      // F3a: custo a partir do valor líquido da linha (com descontos de linha e globais já repartidos).
      unitCostPerBaseUnitWithoutVat = (this.props.totalWithVat - this.props.vatAmount) / baseQuantity;
      unitCostPerBaseUnitWithVat = this.props.totalWithVat / baseQuantity;
    } else {
      // Revisões anteriores à F3a (sem IVA da linha guardado): cálculo original.
      unitCostPerBaseUnitWithoutVat = this.props.unitCostWithoutVat / data.conversionFactor;
      const vatAmount = this.props.totalWithVat - this.props.unitCostWithoutVat * this.props.purchaseQuantity;
      unitCostPerBaseUnitWithVat = unitCostPerBaseUnitWithoutVat + (vatAmount > 0 ? vatAmount / baseQuantity : 0);
    }
    return new StockReviewLine({
      ...this.props,
      resolutionType: isNewItem ? "new_item" : "existing_item",
      stockItemId: data.stockItemId,
      conversionFactor: data.conversionFactor,
      stockQuantity,
      locationSplits: splits,
      locationId: splits ? null : data.locationId !== undefined ? data.locationId : this.props.locationId,
      unitCostPerBaseUnitWithVat,
      unitCostPerBaseUnitWithoutVat,
      flaggedSuspiciousConversion: data.flaggedSuspiciousConversion ?? false,
      flagReason: data.flagReason ?? null,
      resolvedBy,
      resolvedAt: new Date(),
    });
  }

  /** `no_stock_effect` — serviço/taxa/desconto, decisão sempre auditável. */
  resolveAsNoStockEffect(resolvedBy: string): StockReviewLine {
    return new StockReviewLine({
      ...this.props,
      resolutionType: "no_stock_effect",
      locationSplits: null,
      stockItemId: null,
      conversionFactor: null,
      stockQuantity: null,
      unitCostPerBaseUnitWithVat: null,
      unitCostPerBaseUnitWithoutVat: null,
      flaggedSuspiciousConversion: false,
      flagReason: null,
      resolvedBy,
      resolvedAt: new Date(),
    });
  }

  private validateSplits(splits: LocationSplit[]): LocationSplit[] {
    if (splits.length < 2) throw new InvalidReviewLineResolutionError("a divisão por lojas precisa de pelo menos duas lojas");
    if (new Set(splits.map((s) => s.locationId)).size !== splits.length) {
      throw new InvalidReviewLineResolutionError("a mesma loja aparece mais de uma vez na divisão");
    }
    for (const s of splits) assertFiniteQuantity(s.purchaseQuantity, "quantidade por loja");
    const sum = splits.reduce((acc, s) => acc + s.purchaseQuantity, 0);
    if (Math.abs(sum - this.props.purchaseQuantity) > QUANTITY_TOLERANCE) {
      throw new InvalidReviewLineResolutionError(
        `a soma das quantidades por loja (${+sum.toFixed(6)}) tem de ser igual à quantidade da linha (${this.props.purchaseQuantity})`,
      );
    }
    return splits.map((s) => ({ locationId: s.locationId, purchaseQuantity: s.purchaseQuantity }));
  }

  withSuggestion(suggestion: LineSuggestion): StockReviewLine {
    return new StockReviewLine({ ...this.props, suggestion });
  }

  get suggestion(): LineSuggestion | null {
    return this.props.suggestion;
  }

  get supplierItemCode(): string | null {
    return this.props.supplierItemCode;
  }

  get description(): string {
    return this.props.description;
  }

  get purchaseUnit(): string {
    return this.props.purchaseUnit;
  }

  /** Líquido com descontos (total − IVA); null quando o IVA da linha não foi guardado (revisões anteriores à F3a). */
  get netAmount(): number | null {
    return this.props.vatAmount === null ? null : this.props.totalWithVat - this.props.vatAmount;
  }

  /** Desconto da linha = quantidade × preço − líquido (0 sem desconto; null sem IVA guardado). */
  get discountAmount(): number | null {
    const net = this.netAmount;
    if (net === null) return null;
    const gross = this.props.purchaseQuantity * this.props.unitCostWithoutVat;
    return Math.max(0, Math.round(gross - net));
  }

  get id(): string {
    return this.props.id;
  }

  get reviewId(): string {
    return this.props.reviewId;
  }

  get resolutionType(): ResolutionType {
    return this.props.resolutionType;
  }

  get stockItemId(): string | null {
    return this.props.stockItemId;
  }

  get locationId(): string | null {
    return this.props.locationId;
  }

  toProps(): StockReviewLineProps {
    return { ...this.props };
  }
}
