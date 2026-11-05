import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CartLineInput, Discount, PaymentMethod, PosEmployee, PosProduct, PosSaleRecord, PosSettings } from "../../entities/pos.js";
import type { CsvImportPreview } from "../../services/vendus-csv.service.js";

export interface CheckoutInput {
  pin: string;
  lines: CartLineInput[];
  saleDiscount?: Discount;
  payment: { method: PaymentMethod; givenCents?: number };
  customer?: { taxId: string; name: string } | null;
}

export interface RefundInput {
  pin: string;
  lines: Array<{ lineNumber: number; quantity: number }>;
  reason: string;
}

export interface DaySummary {
  date: string;
  salesCount: number;
  salesCents: number;
  refundsCount: number;
  refundsCents: number;
  /** Vendas menos notas de crédito. */
  netCents: number;
  /** Líquido ÷ n.º de vendas (0 sem vendas). */
  averageTicketCents: number;
  /** Fecho por forma de pagamento, já líquido de reembolsos. */
  byPayment: Record<PaymentMethod, number>;
}

export interface PosEmployeeOption {
  id: string;
  name: string;
  isManager: boolean;
}

/** Casos de uso do POS (fase 1). */
export interface PosPort {
  listProducts(org: OrganizationId, opts?: { activeOnly?: boolean }): Promise<PosProduct[]>;
  previewImport(csv: string): CsvImportPreview;
  importProducts(org: OrganizationId, csv: string): Promise<{ created: number; updated: number; skipped: number }>;
  updateProduct(org: OrganizationId, id: string, patch: { name?: string; category?: string | null; priceCents?: number; vatRate?: number; active?: boolean }): Promise<PosProduct>;
  getSettings(org: OrganizationId): Promise<PosSettings>;
  saveSettings(org: OrganizationId, s: PosSettings): Promise<PosSettings>;
  listEmployees(org: OrganizationId): Promise<PosEmployeeOption[]>;
  /** Entrada com o PIN do quiosque de ponto. */
  login(org: OrganizationId, pin: string): Promise<PosEmployee>;
  checkout(org: OrganizationId, input: CheckoutInput): Promise<PosSaleRecord>;
  refund(org: OrganizationId, saleId: string, input: RefundInput): Promise<PosSaleRecord>;
  documents(org: OrganizationId, date?: string): Promise<PosSaleRecord[]>;
  summary(org: OrganizationId, date?: string): Promise<DaySummary>;
}
