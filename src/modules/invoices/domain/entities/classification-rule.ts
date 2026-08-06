import type { InvoiceLineType } from "./invoice.js";

interface ClassificationRuleProps {
  id: string;
  supplierId: string;
  defaultCostCenterId: string | null;
  defaultCostCenterCategoryId: string | null;
  defaultLineType: InvoiceLineType | null;
  defaultCategory: string | null;
  confidenceBoost: number;
  descriptionPattern: string | null;
  channelId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateClassificationRuleData {
  defaultCostCenterId?: string | null;
  defaultCostCenterCategoryId?: string | null;
  defaultLineType?: InvoiceLineType | null;
  defaultCategory?: string | null;
  confidenceBoost?: number;
  descriptionPattern?: string | null;
  channelId?: string | null;
}

export class ClassificationRule {
  readonly id: string;
  readonly supplierId: string;
  readonly defaultCostCenterId: string | null;
  readonly defaultCostCenterCategoryId: string | null;
  readonly defaultLineType: InvoiceLineType | null;
  readonly defaultCategory: string | null;
  readonly confidenceBoost: number;
  readonly descriptionPattern: string | null;
  readonly channelId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: ClassificationRuleProps) {
    this.id = props.id;
    this.supplierId = props.supplierId;
    this.defaultCostCenterId = props.defaultCostCenterId;
    this.defaultCostCenterCategoryId = props.defaultCostCenterCategoryId;
    this.defaultLineType = props.defaultLineType;
    this.defaultCategory = props.defaultCategory;
    this.confidenceBoost = props.confidenceBoost;
    this.descriptionPattern = props.descriptionPattern;
    this.channelId = props.channelId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    supplierId: string;
    defaultCostCenterId?: string | null;
    defaultCostCenterCategoryId?: string | null;
    defaultLineType?: InvoiceLineType | null;
    defaultCategory?: string | null;
    confidenceBoost?: number;
    descriptionPattern?: string | null;
    channelId?: string | null;
  }): ClassificationRule {
    const now = new Date();
    return new ClassificationRule({
      id: crypto.randomUUID(),
      supplierId: props.supplierId,
      defaultCostCenterId: props.defaultCostCenterId ?? null,
      defaultCostCenterCategoryId: props.defaultCostCenterCategoryId ?? null,
      defaultLineType: props.defaultLineType ?? null,
      defaultCategory: props.defaultCategory ?? null,
      confidenceBoost: props.confidenceBoost ?? 0,
      descriptionPattern: props.descriptionPattern ?? null,
      channelId: props.channelId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ClassificationRuleProps): ClassificationRule {
    return new ClassificationRule(props);
  }

  update(data: UpdateClassificationRuleData): ClassificationRule {
    const p: ClassificationRuleProps = {
      id: this.id,
      supplierId: this.supplierId,
      defaultCostCenterId: this.defaultCostCenterId,
      defaultCostCenterCategoryId: this.defaultCostCenterCategoryId,
      defaultLineType: this.defaultLineType,
      defaultCategory: this.defaultCategory,
      confidenceBoost: this.confidenceBoost,
      descriptionPattern: this.descriptionPattern,
      channelId: this.channelId,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    };
    if (data.defaultCostCenterId !== undefined) p.defaultCostCenterId = data.defaultCostCenterId;
    if (data.defaultCostCenterCategoryId !== undefined) p.defaultCostCenterCategoryId = data.defaultCostCenterCategoryId;
    if (data.defaultLineType !== undefined) p.defaultLineType = data.defaultLineType;
    if (data.defaultCategory !== undefined) p.defaultCategory = data.defaultCategory;
    if (data.confidenceBoost !== undefined) p.confidenceBoost = data.confidenceBoost;
    if (data.descriptionPattern !== undefined) p.descriptionPattern = data.descriptionPattern;
    if (data.channelId !== undefined) p.channelId = data.channelId;
    return new ClassificationRule(p);
  }
}
