import { InvalidPurchasePresentationError } from "../errors.js";

import type { ContentUnit, InvoicedBy } from "../../../../kernel/units/purchase-presentation.js";

export type { ContentUnit, InvoicedBy };
export const CONTENT_UNITS: ContentUnit[] = ["g", "kg", "ml", "cl", "l", "un"];

export interface PurchasePresentationProps {
  id: string;
  organizationId: string;
  supplierId: string;
  supplierReference: string | null;
  description: string;
  stockItemId: string;
  /** saco, caixa, lata… — null = não vem em embalagem (vende-se ao peso/unidade). */
  packageUnit: string | null;
  contentQuantity: number;
  contentUnit: ContentUnit;
  invoicedBy: InvoicedBy;
  minOrderPackages: number;
  orderIncrementPackages: number;
  source: "user" | "document" | "catalog";
  confidence: number | null;
  createdBy: string | null;
  createdAt: Date;
  supersededAt: Date | null;
}

export interface NewPurchasePresentation {
  organizationId: string;
  supplierId: string;
  supplierReference: string | null;
  description: string;
  stockItemId: string;
  packageUnit: string | null;
  contentQuantity: number;
  contentUnit: ContentUnit;
  invoicedBy: InvoicedBy;
  minOrderPackages?: number;
  orderIncrementPackages?: number;
  source: "user" | "document" | "catalog";
  confidence?: number | null;
  createdBy?: string | null;
}

const positive = (n: number) => Number.isFinite(n) && n > 0;

/**
 * Como um artigo vem de um fornecedor (task «embalagens e conversões»): «1 saco = 2,5 kg», se a
 * fatura conta sacos ou kg, e a encomenda mínima/incremento em embalagens. Versionada: alterar cria
 * outra (a anterior fica com `supersededAt`), nunca se recalcula o passado.
 */
export class PurchasePresentation {
  private constructor(private readonly props: PurchasePresentationProps) {}

  static create(data: NewPurchasePresentation): PurchasePresentation {
    const packageUnit = data.packageUnit?.trim() ? data.packageUnit.trim().toLowerCase() : null;
    if (!positive(data.contentQuantity)) throw new InvalidPurchasePresentationError("o conteúdo de cada embalagem tem de ser positivo");
    if (!(["g", "kg", "ml", "cl", "l", "un"] as string[]).includes(data.contentUnit)) throw new InvalidPurchasePresentationError("unidade do conteúdo inválida");
    if (!packageUnit && data.invoicedBy === "package") throw new InvalidPurchasePresentationError("sem embalagem, a fatura só pode contar o conteúdo (kg, L, un)");
    const min = data.minOrderPackages ?? 1;
    const inc = data.orderIncrementPackages ?? 1;
    if (!positive(min) || !positive(inc)) throw new InvalidPurchasePresentationError("encomenda mínima e incremento têm de ser positivos");
    if (!data.description.trim()) throw new InvalidPurchasePresentationError("falta a descrição do artigo do fornecedor");
    return new PurchasePresentation({
      id: crypto.randomUUID(),
      organizationId: data.organizationId,
      supplierId: data.supplierId,
      supplierReference: data.supplierReference?.trim() || null,
      description: data.description.trim(),
      stockItemId: data.stockItemId,
      packageUnit,
      contentQuantity: data.contentQuantity,
      contentUnit: data.contentUnit,
      invoicedBy: data.invoicedBy,
      minOrderPackages: min,
      orderIncrementPackages: inc,
      source: data.source,
      confidence: data.confidence ?? null,
      createdBy: data.createdBy ?? null,
      createdAt: new Date(),
      supersededAt: null,
    });
  }

  static reconstitute(props: PurchasePresentationProps): PurchasePresentation {
    return new PurchasePresentation(props);
  }

  /** Chave da apresentação ativa: a referência do fornecedor, senão a descrição normalizada. */
  static matchKey(supplierReference: string | null, normalizedDescription: string): string {
    return supplierReference?.trim() ? `ref:${supplierReference.trim()}` : `desc:${normalizedDescription}`;
  }

  supersede(): PurchasePresentation {
    return new PurchasePresentation({ ...this.props, supersededAt: new Date() });
  }

  get id(): string {
    return this.props.id;
  }

  get stockItemId(): string {
    return this.props.stockItemId;
  }

  toProps(): PurchasePresentationProps {
    return { ...this.props };
  }
}
