import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CartLineInput, Discount, PaymentMethod, PosEmployee, PosProduct, PosSaleRecord, PosSettings, PosView, StockMove } from "../../entities/pos.js";
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

/** Movimento de stock com o nome do produto (para o painel e a gestão). */
export type StockMoveView = StockMove & { productName: string; alert: boolean };

export interface StockDay {
  date: string;
  moves: StockMoveView[];
  /** Vendas feitas sem stock suficiente (o stock ficou negativo). */
  alerts: StockMoveView[];
}

export type ProductPatch = {
  name?: string;
  category?: string | null;
  priceCents?: number;
  vatRate?: number;
  active?: boolean;
  trackStock?: boolean;
  barcode?: string | null;
};

export type StockAdjustment = { kind: "entry"; qty: number; note?: string | null } | { kind: "count"; countTo: number; note?: string | null };

export interface PosEmployeeOption {
  id: string;
  name: string;
  isManager: boolean;
}

/** Casos de uso do POS. */
export interface PosPort {
  listProducts(org: OrganizationId, opts?: { activeOnly?: boolean }): Promise<PosProduct[]>;
  previewImport(csv: string): CsvImportPreview;
  /** `replace`: os produtos fora do ficheiro deixam de estar à venda. */
  importProducts(org: OrganizationId, csv: string, opts?: { replace?: boolean }): Promise<{ created: number; updated: number; skipped: number; deactivated: number }>;
  updateProduct(org: OrganizationId, id: string, patch: ProductPatch): Promise<PosProduct>;
  /** Entrada ou contagem de stock (gestão); `actorName` = quem fez, para o registo. */
  adjustStock(org: OrganizationId, productId: string, adjustment: StockAdjustment, actorName: string): Promise<StockMove>;
  /** Movimentos e alertas de stock de um dia de Lisboa (hoje por omissão). */
  stockDay(org: OrganizationId, date?: string): Promise<StockDay>;
  getSettings(org: OrganizationId): Promise<PosSettings>;
  saveSettings(org: OrganizationId, s: PosSettings): Promise<PosSettings>;
  listEmployees(org: OrganizationId): Promise<PosEmployeeOption[]>;
  /** Entrada com o PIN do quiosque de ponto. */
  login(org: OrganizationId, pin: string): Promise<PosEmployee>;
  /** O funcionário (pelo PIN) escolhe a sua vista; fica lembrada na próxima entrada. */
  setView(org: OrganizationId, pin: string, view: PosView): Promise<PosEmployee>;
  checkout(org: OrganizationId, input: CheckoutInput): Promise<PosSaleRecord>;
  refund(org: OrganizationId, saleId: string, input: RefundInput): Promise<PosSaleRecord>;
  documents(org: OrganizationId, date?: string): Promise<PosSaleRecord[]>;
  summary(org: OrganizationId, date?: string): Promise<DaySummary>;
}
