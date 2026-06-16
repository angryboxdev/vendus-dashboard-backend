export type CostCenterStatus = "active" | "inactive";

export type CostCenterCategory =
  | "administration"
  | "operations"
  | "marketing"
  | "logistics"
  | "hr"
  | "technology"
  | "finance"
  | "real_estate"
  | "app_delivery"
  | "other";

export const COST_CENTER_CATEGORIES: CostCenterCategory[] = [
  "administration",
  "operations",
  "marketing",
  "logistics",
  "hr",
  "technology",
  "finance",
  "real_estate",
  "app_delivery",
  "other",
];

interface CostCenterProps {
  id: string;
  code: string;
  name: string;
  category: CostCenterCategory;
  subcategory: string | null;
  description: string | null;
  responsibleName: string | null;
  status: CostCenterStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateCostCenterData {
  name?: string;
  category?: CostCenterCategory;
  subcategory?: string | null;
  description?: string | null;
  responsibleName?: string | null;
}

export class CostCenter {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: CostCenterCategory;
  readonly subcategory: string | null;
  readonly description: string | null;
  readonly responsibleName: string | null;
  readonly status: CostCenterStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: CostCenterProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.category = props.category;
    this.subcategory = props.subcategory;
    this.description = props.description;
    this.responsibleName = props.responsibleName;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    code: string;
    name: string;
    category: CostCenterCategory;
    subcategory?: string | null;
    description?: string | null;
    responsibleName?: string | null;
  }): CostCenter {
    const now = new Date();
    return new CostCenter({
      id: crypto.randomUUID(),
      code: props.code.trim().toUpperCase(),
      name: props.name.trim(),
      category: props.category,
      subcategory: props.subcategory ?? null,
      description: props.description ?? null,
      responsibleName: props.responsibleName ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: CostCenterProps): CostCenter {
    return new CostCenter(props);
  }

  update(data: UpdateCostCenterData): CostCenter {
    return new CostCenter({
      id: this.id,
      code: this.code,
      name: data.name !== undefined ? data.name.trim() : this.name,
      category: data.category ?? this.category,
      subcategory: data.subcategory !== undefined ? data.subcategory : this.subcategory,
      description: data.description !== undefined ? data.description : this.description,
      responsibleName: data.responsibleName !== undefined ? data.responsibleName : this.responsibleName,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  activate(): CostCenter {
    return new CostCenter({ ...this.toProps(), status: "active", updatedAt: new Date() });
  }

  deactivate(): CostCenter {
    return new CostCenter({ ...this.toProps(), status: "inactive", updatedAt: new Date() });
  }

  private toProps(): CostCenterProps {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      category: this.category,
      subcategory: this.subcategory,
      description: this.description,
      responsibleName: this.responsibleName,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
