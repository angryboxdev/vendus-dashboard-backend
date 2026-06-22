export interface UpdateCostCenterGroupData {
  name?: string;
  description?: string | null;
  sortOrder?: number;
}

interface CostCenterGroupProps {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class CostCenterGroup {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: CostCenterGroupProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.description = props.description;
    this.sortOrder = props.sortOrder;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    code: string;
    name: string;
    description?: string | null;
    sortOrder?: number;
  }): CostCenterGroup {
    const now = new Date();
    return new CostCenterGroup({
      id: crypto.randomUUID(),
      code: props.code.trim().toUpperCase(),
      name: props.name.trim(),
      description: props.description ?? null,
      sortOrder: props.sortOrder ?? 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: CostCenterGroupProps): CostCenterGroup {
    return new CostCenterGroup(props);
  }

  update(data: UpdateCostCenterGroupData): CostCenterGroup {
    return new CostCenterGroup({
      ...this.toProps(),
      name: data.name !== undefined ? data.name.trim() : this.name,
      description: data.description !== undefined ? data.description : this.description,
      sortOrder: data.sortOrder !== undefined ? data.sortOrder : this.sortOrder,
      updatedAt: new Date(),
    });
  }

  activate(): CostCenterGroup {
    return new CostCenterGroup({ ...this.toProps(), isActive: true, updatedAt: new Date() });
  }

  deactivate(): CostCenterGroup {
    return new CostCenterGroup({ ...this.toProps(), isActive: false, updatedAt: new Date() });
  }

  private toProps(): CostCenterGroupProps {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      description: this.description,
      sortOrder: this.sortOrder,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
