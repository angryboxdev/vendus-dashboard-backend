export type SupplierStatus = "active" | "inactive";

interface SupplierProps {
  id: string;
  name: string;
  nif: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  iban: string | null;
  defaultCostCenterGroupId: string | null;
  defaultCostCenterCategoryId: string | null;
  paymentTermsDays: number | null;
  notes: string | null;
  status: SupplierStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSupplierData {
  name?: string;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  iban?: string | null;
  defaultCostCenterGroupId?: string | null;
  defaultCostCenterCategoryId?: string | null;
  paymentTermsDays?: number | null;
  notes?: string | null;
}

export class Supplier {
  readonly id: string;
  readonly name: string;
  readonly nif: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly iban: string | null;
  readonly defaultCostCenterGroupId: string | null;
  readonly defaultCostCenterCategoryId: string | null;
  readonly paymentTermsDays: number | null;
  readonly notes: string | null;
  readonly status: SupplierStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: SupplierProps) {
    this.id = props.id;
    this.name = props.name;
    this.nif = props.nif;
    this.email = props.email;
    this.phone = props.phone;
    this.address = props.address;
    this.iban = props.iban;
    this.defaultCostCenterGroupId = props.defaultCostCenterGroupId;
    this.defaultCostCenterCategoryId = props.defaultCostCenterCategoryId;
    this.paymentTermsDays = props.paymentTermsDays;
    this.notes = props.notes;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: {
    name: string;
    nif?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    iban?: string | null;
    defaultCostCenterGroupId?: string | null;
    defaultCostCenterCategoryId?: string | null;
    paymentTermsDays?: number | null;
    notes?: string | null;
  }): Supplier {
    const now = new Date();
    return new Supplier({
      id: crypto.randomUUID(),
      name: props.name.trim(),
      nif: props.nif ?? null,
      email: props.email ?? null,
      phone: props.phone ?? null,
      address: props.address ?? null,
      iban: props.iban ?? null,
      defaultCostCenterGroupId: props.defaultCostCenterGroupId ?? null,
      defaultCostCenterCategoryId: props.defaultCostCenterCategoryId ?? null,
      paymentTermsDays: props.paymentTermsDays ?? null,
      notes: props.notes ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: SupplierProps): Supplier {
    return new Supplier(props);
  }

  update(data: UpdateSupplierData): Supplier {
    return new Supplier({
      id: this.id,
      name: data.name !== undefined ? data.name.trim() : this.name,
      nif: data.nif !== undefined ? data.nif : this.nif,
      email: data.email !== undefined ? data.email : this.email,
      phone: data.phone !== undefined ? data.phone : this.phone,
      address: data.address !== undefined ? data.address : this.address,
      iban: data.iban !== undefined ? data.iban : this.iban,
      defaultCostCenterGroupId:
        data.defaultCostCenterGroupId !== undefined
          ? data.defaultCostCenterGroupId
          : this.defaultCostCenterGroupId,
      defaultCostCenterCategoryId:
        data.defaultCostCenterCategoryId !== undefined
          ? data.defaultCostCenterCategoryId
          : this.defaultCostCenterCategoryId,
      paymentTermsDays:
        data.paymentTermsDays !== undefined ? data.paymentTermsDays : this.paymentTermsDays,
      notes: data.notes !== undefined ? data.notes : this.notes,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  activate(): Supplier {
    return new Supplier({ ...this.toProps(), status: "active", updatedAt: new Date() });
  }

  deactivate(): Supplier {
    return new Supplier({ ...this.toProps(), status: "inactive", updatedAt: new Date() });
  }

  private toProps(): SupplierProps {
    return {
      id: this.id,
      name: this.name,
      nif: this.nif,
      email: this.email,
      phone: this.phone,
      address: this.address,
      iban: this.iban,
      defaultCostCenterGroupId: this.defaultCostCenterGroupId,
      defaultCostCenterCategoryId: this.defaultCostCenterCategoryId,
      paymentTermsDays: this.paymentTermsDays,
      notes: this.notes,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
