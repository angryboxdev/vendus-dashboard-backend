import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface ConfirmReviewResult {
  reviewId: string;
  status: string;
  version: number;
  movementIds: string[];
  alreadyApplied: boolean;
}

export interface CreateReviewFromInvoiceLineInput {
  invoiceLineId: string;
  description: string;
  purchaseQuantity: number;
  purchaseUnit: string;
  unitCostWithoutVat: number;
  totalWithVat: number;
  vatAmount: number | null;
  supplierItemCode: string | null;
  costCenterCategoryId: string | null;
  locationId: string | null;
}

export interface CreateReviewFromInvoiceInput {
  invoiceId: string;
  sourceInvoiceVersion: number;
  sourceHash: string;
  decisionSource: string;
  decisionCategoryId: string | null;
  decisionSupplierId: string | null;
  decisionPolicyUsed: string;
  decisionActor: string | null;
  decisionOverrideReason: string | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceNetCents: number | null;
  invoiceVatCents: number | null;
  invoiceTotalCents: number | null;
  /** F3c: `stock` = importada no Stock (fica pendente do Financeiro); `finance` limpa essa pendência se a revisão já existir. */
  origin?: "finance" | "stock";
  lines: CreateReviewFromInvoiceLineInput[];
}

export interface CreateReviewFromInvoiceResult {
  reviewId: string;
  createdNow: boolean;
}

/**
 * As duas únicas RPCs `plpgsql` deste módulo — PostgREST não dá transações
 * multi-tabela ad-hoc (ver `20260829140000_scope_stock_quantities_rpc.sql`,
 * o único outro RPC do repositório). `fn_stock_review_create_from_invoice`
 * é idempotente por construção (`ON CONFLICT (invoice_id) DO NOTHING`);
 * `fn_stock_review_confirm` é a transação atómica "tudo ou nada" da
 * confirmação, com lock otimista e curto-circuito quando já `applied`.
 */
export interface StockMovementWritePort {
  createReviewFromInvoice(organizationId: OrganizationId, input: CreateReviewFromInvoiceInput): Promise<CreateReviewFromInvoiceResult>;
  /** F3c: o Financeiro lançou a fatura importada no Stock (sem nova revisão) → acaba a pendência. */
  finishFinancePending?(organizationId: OrganizationId, invoiceId: string): Promise<void>;
  confirmReview(
    organizationId: OrganizationId,
    reviewId: string,
    expectedVersion: number,
    confirmedBy: string,
    effectiveDate: string,
    /** Fallback só para linhas sem `locationId` próprio (secção 46 — nunca decidido pelo Centro de Custo). */
    fallbackLocationId: string | null,
  ): Promise<ConfirmReviewResult>;
}
