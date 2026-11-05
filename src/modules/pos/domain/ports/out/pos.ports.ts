import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { NewPosProduct, PosProduct, PosSaleRecord, PosSettings, PosView, StockMove } from "../../entities/pos.js";

/** Produtos, configuração e registo das vendas do POS. */
export interface PosStorePort {
  listProducts(org: OrganizationId, opts?: { activeOnly?: boolean }): Promise<PosProduct[]>;
  productsByIds(org: OrganizationId, ids: string[]): Promise<PosProduct[]>;
  /** Cria ou atualiza pela referência; devolve quantos criou e atualizou. */
  upsertProducts(org: OrganizationId, products: NewPosProduct[]): Promise<{ created: number; updated: number }>;
  /** O stock não se altera aqui: só por `recordStockMove` (e pela venda registada). */
  updateProduct(org: OrganizationId, id: string, patch: Partial<Omit<PosProduct, "id" | "ref" | "stockQty">>): Promise<PosProduct>;
  getSettings(org: OrganizationId): Promise<PosSettings>;
  saveSettings(org: OrganizationId, s: PosSettings): Promise<void>;
  /** Vista escolhida pelo funcionário (null = nunca escolheu). */
  getEmployeeView(org: OrganizationId, employeeId: string): Promise<PosView | null>;
  setEmployeeView(org: OrganizationId, employeeId: string, view: PosView): Promise<void>;
  /**
   * Registo append-only de vendas e devoluções. A gravação gera, na mesma
   * transação, os movimentos de stock dos artigos que controlam stock.
   */
  recordSale(org: OrganizationId, r: Omit<PosSaleRecord, "id" | "createdAt">): Promise<PosSaleRecord>;
  getSale(org: OrganizationId, id: string): Promise<PosSaleRecord | null>;
  /** Vendas e devoluções entre dois instantes (ISO), por ordem. */
  salesBetween(org: OrganizationId, fromIso: string, toIso: string): Promise<PosSaleRecord[]>;
  refundsOf(org: OrganizationId, saleId: string): Promise<PosSaleRecord[]>;
  /** Entrada (+qty) ou contagem (stock passa a `countTo`) feita na gestão; devolve o movimento aplicado. */
  recordStockMove(
    org: OrganizationId,
    m: { productId: string; actorName: string; note: string | null } & ({ kind: "entry"; qty: number } | { kind: "count"; countTo: number }),
  ): Promise<StockMove>;
  /** Movimentos de stock entre dois instantes (ISO), por ordem. */
  stockMovesBetween(org: OrganizationId, fromIso: string, toIso: string): Promise<StockMove[]>;
}

/** Linha de um documento fiscal, no formato do motor de faturação. */
export interface InvoiceLine {
  productCode: string;
  productType: "P" | "S";
  description: string;
  quantity: number;
  /** Euros com IVA, 2 casas («9.90»). */
  unitPrice: string;
  discountPct: string | null;
  vatRate: number;
}

export interface IssuedDocument {
  documentId: string;
  documentNumber: string;
  /** Total com IVA do documento gravado, em cêntimos. */
  totalCents: number;
}

/**
 * Faturação (módulo `invoicing`, ligado no server.ts): emite a FR da venda e a
 * NC da devolução. Erros fiscais chegam como `PosRuleError`.
 */
export interface InvoicingGatewayPort {
  issueInvoiceReceipt(
    org: OrganizationId,
    q: { seriesRef: string; lines: InvoiceLine[]; paymentMechanism: "CD" | "NU" | "OU"; customer: { taxId: string; name: string } | null; actor: string },
  ): Promise<IssuedDocument>;
  issueCreditNote(
    org: OrganizationId,
    q: { seriesRef: string; lines: InvoiceLine[]; referenceDocumentId: string; reason: string; customer: { taxId: string; name: string } | null; actor: string },
  ): Promise<IssuedDocument>;
  /** Cliente do documento original (a NC é para o mesmo cliente). */
  documentCustomer(org: OrganizationId, documentId: string): Promise<{ taxId: string; name: string } | null>;
}

/** Funcionários com PIN do quiosque de ponto (módulo RH, só leitura). */
export interface PosEmployeesPort {
  findActiveByPin(org: OrganizationId, pin: string): Promise<{ id: string; name: string } | null>;
  listActive(org: OrganizationId): Promise<Array<{ id: string; name: string }>>;
}

export interface PosClockPort {
  /** Instante atual (ISO UTC). */
  nowIso(): string;
  /** Início e fim (ISO UTC) de um dia de Lisboa (AAAA-MM-DD). */
  lisbonDayBounds(date: string): { fromIso: string; toIso: string };
  todayLisbon(): string;
}
