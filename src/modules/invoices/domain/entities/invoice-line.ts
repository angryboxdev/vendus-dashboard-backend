import type { InvoiceLineType } from "./invoice.js";
import { ChannelRequiredError } from "../errors.js";

interface InvoiceLineProps {
  id: string;
  invoiceId: string;
  description: string;
  type: InvoiceLineType;
  costCenterId: string | null;
  costCenterCategoryId: string | null;
  category: string | null;
  subcategory: string | null;
  stockItemId: string | null;
  quantity: number;
  unit: string | null;
  unitCostWithoutVat: number;
  vatRate: number;
  vatAmount: number;
  totalWithVat: number;
  stockEntryId: string | null;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  // Campos herdados da subcategoria ao classificar (Fase 2 adiciona a lógica de herança)
  financialType: string | null;
  channelId: string | null;
  requiresChannel: boolean;
  requiresAllocation: boolean;
  // Sugestão de IA
  aiSuggestedCategoryId: string | null;
  aiConfidence: number | null;
  createdAt: Date;
}

export interface ClassifyLineData {
  type?: InvoiceLineType;
  costCenterCategoryId?: string | null;
  stockItemId?: string | null;
}

export interface CategorySnapshot {
  id: string;
  financialType: string;
  affectsDre: boolean;
  affectsCashflow: boolean;
  affectsProfitability: boolean;
  requiresChannel: boolean;
  requiresAllocation: boolean;
}

export class InvoiceLine {
  readonly id: string;
  readonly invoiceId: string;
  readonly description: string;
  readonly type: InvoiceLineType;
  readonly costCenterId: string | null;
  readonly costCenterCategoryId: string | null;
  readonly category: string | null;
  readonly subcategory: string | null;
  readonly stockItemId: string | null;
  readonly quantity: number;
  readonly unit: string | null;
  readonly unitCostWithoutVat: number;
  readonly vatRate: number;
  readonly vatAmount: number;
  readonly totalWithVat: number;
  readonly stockEntryId: string | null;
  readonly affectsDre: boolean;
  readonly affectsCashflow: boolean;
  readonly affectsProfitability: boolean;
  readonly financialType: string | null;
  readonly channelId: string | null;
  readonly requiresChannel: boolean;
  readonly requiresAllocation: boolean;
  readonly aiSuggestedCategoryId: string | null;
  readonly aiConfidence: number | null;
  readonly createdAt: Date;

  private constructor(props: InvoiceLineProps) {
    this.id = props.id;
    this.invoiceId = props.invoiceId;
    this.description = props.description;
    this.type = props.type;
    this.costCenterId = props.costCenterId;
    this.costCenterCategoryId = props.costCenterCategoryId;
    this.category = props.category;
    this.subcategory = props.subcategory;
    this.stockItemId = props.stockItemId;
    this.quantity = props.quantity;
    this.unit = props.unit;
    this.unitCostWithoutVat = props.unitCostWithoutVat;
    this.vatRate = props.vatRate;
    this.vatAmount = props.vatAmount;
    this.totalWithVat = props.totalWithVat;
    this.stockEntryId = props.stockEntryId;
    this.affectsDre = props.affectsDre;
    this.affectsCashflow = props.affectsCashflow;
    this.affectsProfitability = props.affectsProfitability;
    this.financialType = props.financialType;
    this.channelId = props.channelId;
    this.requiresChannel = props.requiresChannel;
    this.requiresAllocation = props.requiresAllocation;
    this.aiSuggestedCategoryId = props.aiSuggestedCategoryId;
    this.aiConfidence = props.aiConfidence;
    this.createdAt = props.createdAt;
  }

  static create(props: {
    invoiceId: string;
    description: string;
    type?: InvoiceLineType;
    costCenterId?: string | null;
    costCenterCategoryId?: string | null;
    category?: string | null;
    subcategory?: string | null;
    stockItemId?: string | null;
    quantity: number;
    unit?: string | null;
    unitCostWithoutVat: number;
    vatRate: number;
    vatAmount: number;
    totalWithVat: number;
    affectsDre?: boolean;
    affectsCashflow?: boolean;
    affectsProfitability?: boolean;
  }): InvoiceLine {
    return new InvoiceLine({
      id: crypto.randomUUID(),
      invoiceId: props.invoiceId,
      description: props.description.trim(),
      type: props.type ?? "other",
      costCenterId: props.costCenterId ?? null,
      costCenterCategoryId: props.costCenterCategoryId ?? null,
      category: props.category ?? null,
      subcategory: props.subcategory ?? null,
      stockItemId: props.stockItemId ?? null,
      quantity: props.quantity,
      unit: props.unit ?? null,
      unitCostWithoutVat: props.unitCostWithoutVat,
      vatRate: props.vatRate,
      vatAmount: props.vatAmount,
      totalWithVat: props.totalWithVat,
      stockEntryId: null,
      affectsDre: props.affectsDre ?? true,
      affectsCashflow: props.affectsCashflow ?? true,
      affectsProfitability: props.affectsProfitability ?? false,
      financialType: null,
      channelId: null,
      requiresChannel: false,
      requiresAllocation: false,
      aiSuggestedCategoryId: null,
      aiConfidence: null,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: InvoiceLineProps): InvoiceLine {
    return new InvoiceLine(props);
  }

  classify(data: ClassifyLineData): InvoiceLine {
    const p = this.toProps();
    if (data.type !== undefined) p.type = data.type;
    if (data.costCenterCategoryId !== undefined) p.costCenterCategoryId = data.costCenterCategoryId;
    if (data.stockItemId !== undefined) p.stockItemId = data.stockItemId;
    return new InvoiceLine(p);
  }

  classifyFromCategory(category: CategorySnapshot, channelId?: string | null): InvoiceLine {
    if (category.requiresChannel && !channelId) {
      throw new ChannelRequiredError(category.id);
    }
    const p = this.toProps();
    p.costCenterCategoryId = category.id;
    p.financialType = category.financialType;
    p.affectsDre = category.affectsDre;
    p.affectsCashflow = category.affectsCashflow;
    p.affectsProfitability = category.affectsProfitability;
    p.requiresChannel = category.requiresChannel;
    p.requiresAllocation = category.requiresAllocation;
    if (channelId !== undefined) p.channelId = channelId;
    return new InvoiceLine(p);
  }

  setStockEntry(stockEntryId: string): InvoiceLine {
    return new InvoiceLine({ ...this.toProps(), stockEntryId });
  }

  private toProps(): InvoiceLineProps {
    return {
      id: this.id,
      invoiceId: this.invoiceId,
      description: this.description,
      type: this.type,
      costCenterId: this.costCenterId,
      costCenterCategoryId: this.costCenterCategoryId,
      category: this.category,
      subcategory: this.subcategory,
      stockItemId: this.stockItemId,
      quantity: this.quantity,
      unit: this.unit,
      unitCostWithoutVat: this.unitCostWithoutVat,
      vatRate: this.vatRate,
      vatAmount: this.vatAmount,
      totalWithVat: this.totalWithVat,
      stockEntryId: this.stockEntryId,
      affectsDre: this.affectsDre,
      affectsCashflow: this.affectsCashflow,
      affectsProfitability: this.affectsProfitability,
      financialType: this.financialType,
      channelId: this.channelId,
      requiresChannel: this.requiresChannel,
      requiresAllocation: this.requiresAllocation,
      aiSuggestedCategoryId: this.aiSuggestedCategoryId,
      aiConfidence: this.aiConfidence,
      createdAt: this.createdAt,
    };
  }
}
