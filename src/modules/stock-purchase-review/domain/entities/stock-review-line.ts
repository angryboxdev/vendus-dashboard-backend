import { InactiveStockItemReferencedError, InvalidConversionFactorError, InvalidReviewLineResolutionError } from "../errors.js";

export type ResolutionType = "unresolved" | "existing_item" | "new_item" | "no_stock_effect";

export const RESOLUTION_TYPES: ResolutionType[] = ["unresolved", "existing_item", "new_item", "no_stock_effect"];

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
}

export interface ResolveAsExistingOrNewItemData {
  stockItemId: string;
  conversionFactor: number;
  locationId?: string | null;
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
      resolutionType: "unresolved",
      stockItemId: null,
      conversionFactor: null,
      stockQuantity: null,
      locationId: null,
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
    const stockQuantity = this.props.purchaseQuantity * data.conversionFactor;
    const unitCostWithoutVatPerPurchaseUnit = this.props.unitCostWithoutVat;
    const unitCostPerBaseUnitWithoutVat = unitCostWithoutVatPerPurchaseUnit / data.conversionFactor;
    const vatAmount = this.props.totalWithVat - this.props.unitCostWithoutVat * this.props.purchaseQuantity;
    const unitCostPerBaseUnitWithVat =
      unitCostPerBaseUnitWithoutVat + (vatAmount > 0 ? vatAmount / (this.props.purchaseQuantity * data.conversionFactor) : 0);
    return new StockReviewLine({
      ...this.props,
      resolutionType: isNewItem ? "new_item" : "existing_item",
      stockItemId: data.stockItemId,
      conversionFactor: data.conversionFactor,
      stockQuantity,
      locationId: data.locationId !== undefined ? data.locationId : this.props.locationId,
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
