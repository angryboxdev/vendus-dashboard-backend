import { InvalidDefaultStockPolicyError, InvalidFinancialModeError } from "../errors.js";

export type SupplierStatus = "active" | "inactive";

/**
 * Módulo Stock (Compra por rever) — só preferência complementar; nunca
 * pode ignorar uma classificação financeira explícita (`CREATE_REVIEW`/
 * `NO_STOCK_EFFECT` na categoria) que determine impacto em stock.
 */
//
// F2 v1.2 §2.1 — rótulos: inherit = «Seguir a categoria», usually_creates_review = «Enviar por
// defeito», usually_skips_review = «Não enviar», decide_per_document = «Decidir no documento»
// (exige escolha explícita no lançamento; ausência de decisão não equivale a «Não enviar»).
export type DefaultStockPolicy = "inherit" | "usually_creates_review" | "usually_skips_review" | "decide_per_document";

export const DEFAULT_STOCK_POLICIES: DefaultStockPolicy[] = [
  "inherit",
  "usually_creates_review",
  "usually_skips_review",
  "decide_per_document",
];

/** Modo de classificação financeira (F2 §2.2): «Única» | «Por artigo» | «Por valores». */
export type FinancialMode = "single" | "by_item" | "by_values";
export const FINANCIAL_MODES: FinancialMode[] = ["single", "by_item", "by_values"];

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
  defaultStockPolicy: DefaultStockPolicy;
  /** Tipo financeiro habitual (já existia na BD; passa a ser editável). */
  defaultFinancialType?: string | null;
  /** Modo financeiro preferido (fornecedor misto pode preferir «Por valores»). */
  defaultFinancialMode?: FinancialMode | null;
  /** Destino habitual — uma loja concreta, nunca «todas». */
  defaultLocationId?: string | null;
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
  defaultStockPolicy?: DefaultStockPolicy;
  defaultFinancialType?: string | null;
  defaultFinancialMode?: FinancialMode | null;
  defaultLocationId?: string | null;
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
  readonly defaultStockPolicy: DefaultStockPolicy;
  readonly defaultFinancialType: string | null;
  readonly defaultFinancialMode: FinancialMode | null;
  readonly defaultLocationId: string | null;
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
    this.defaultStockPolicy = props.defaultStockPolicy;
    this.defaultFinancialType = props.defaultFinancialType ?? null;
    this.defaultFinancialMode = props.defaultFinancialMode ?? null;
    this.defaultLocationId = props.defaultLocationId ?? null;
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
    defaultStockPolicy?: string;
    defaultFinancialType?: string | null;
    defaultFinancialMode?: string | null;
    defaultLocationId?: string | null;
  }): Supplier {
    if (props.defaultStockPolicy !== undefined && !DEFAULT_STOCK_POLICIES.includes(props.defaultStockPolicy as DefaultStockPolicy)) {
      throw new InvalidDefaultStockPolicyError(props.defaultStockPolicy);
    }
    assertFinancialMode(props.defaultFinancialMode);
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
      defaultStockPolicy: (props.defaultStockPolicy as DefaultStockPolicy) ?? "inherit",
      defaultFinancialType: props.defaultFinancialType ?? null,
      defaultFinancialMode: (props.defaultFinancialMode as FinancialMode | null | undefined) ?? null,
      defaultLocationId: props.defaultLocationId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: SupplierProps): Supplier {
    return new Supplier(props);
  }

  update(data: UpdateSupplierData): Supplier {
    if (data.defaultStockPolicy !== undefined && !DEFAULT_STOCK_POLICIES.includes(data.defaultStockPolicy)) {
      throw new InvalidDefaultStockPolicyError(data.defaultStockPolicy);
    }
    assertFinancialMode(data.defaultFinancialMode);
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
      defaultStockPolicy: data.defaultStockPolicy ?? this.defaultStockPolicy,
      defaultFinancialType: data.defaultFinancialType !== undefined ? data.defaultFinancialType : this.defaultFinancialType,
      defaultFinancialMode: data.defaultFinancialMode !== undefined ? data.defaultFinancialMode : this.defaultFinancialMode,
      defaultLocationId: data.defaultLocationId !== undefined ? data.defaultLocationId : this.defaultLocationId,
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
      defaultStockPolicy: this.defaultStockPolicy,
      defaultFinancialType: this.defaultFinancialType,
      defaultFinancialMode: this.defaultFinancialMode,
      defaultLocationId: this.defaultLocationId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

function assertFinancialMode(mode: string | null | undefined): void {
  if (mode != null && !FINANCIAL_MODES.includes(mode as FinancialMode)) throw new InvalidFinancialModeError(mode);
}
