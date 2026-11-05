/**
 * POS do Mezza: produtos vendidos na caixa, vendas e devoluções, stock próprio (fase 2).
 * Os documentos fiscais são do módulo `invoicing` (formação até haver certificado).
 */

/** Taxas de IVA de Portugal continental aceites nos produtos (CIVA, Lista I/II). */
export const POS_VAT_RATES = [6, 13, 23] as const;
export type PosVatRate = (typeof POS_VAT_RATES)[number];

export interface PosProduct {
  id: string;
  /** Referência (código do artigo no SAF-T). */
  ref: string;
  name: string;
  category: string | null;
  /** Preço de venda com IVA, em cêntimos. */
  priceCents: number;
  vatRate: PosVatRate;
  /** P produto, S serviço (SAF-T ProductType). */
  productType: "P" | "S";
  /** Controla stock (bebidas sim, pizzas não). */
  trackStock: boolean;
  /** Stock atual do POS (pode ser negativo: venda sem stock é permitida). */
  stockQty: number;
  /** Código de barras (EAN) lido pelo leitor; único na organização. */
  barcode: string | null;
  imageUrl: string | null;
  active: boolean;
}

export type NewPosProduct = Omit<PosProduct, "id" | "active" | "stockQty">;

/** Código de barras aceite (EAN-8/13, UPC, Code 128 simples). */
export const BARCODE = /^[0-9A-Za-z.-]{4,40}$/;

export type PaymentMethod = "card" | "cash" | "mbway";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["card", "cash", "mbway"];

/**
 * Meio de pagamento SAF-T (Portaria 302/2016, 4.1.4.20.6.1): cartão → CD (débito),
 * numerário → NU, MB Way → OU (sem código próprio). A confirmar com o contabilista.
 */
export const SAFT_PAYMENT: Record<PaymentMethod, "CD" | "NU" | "OU"> = { card: "CD", cash: "NU", mbway: "OU" };

export type Discount = { kind: "pct"; value: number } | { kind: "eur"; value: number };

export interface CartLineInput {
  productId: string;
  quantity: number;
  discount?: Discount;
}

/** Funcionário que entrou com o PIN do quiosque de ponto. */
export interface PosEmployee {
  id: string;
  name: string;
  isManager: boolean;
  /** Vista do ecrã de venda: a escolhida pelo funcionário ou a por omissão. */
  view: PosView;
}

/** A = grelha com talão; B = lista com pesquisa. */
export type PosView = "A" | "B";
export const POS_VIEWS: readonly PosView[] = ["A", "B"];

export interface PosSettings {
  /** Série de faturas-recibo (FR) usada pelo POS. */
  invoiceSeriesRef: string | null;
  /** Série de notas de crédito (NC). */
  creditSeriesRef: string | null;
  managerEmployeeIds: string[];
  /** Vista por omissão (definida pelo gestor). */
  defaultView: PosView;
}

/** Uma linha vendida, como fica registada na venda (para devoluções e painel). */
export interface SoldLine {
  lineNumber: number;
  productId: string;
  ref: string;
  name: string;
  quantity: number;
  /** Preço unitário com IVA à data da venda, em cêntimos. */
  unitPriceCents: number;
  /** Desconto enviado ao documento (percentagem com 6 casas) ou null. */
  discountPct: string | null;
  vatRate: number;
  productType: "P" | "S";
  /** Total da linha com IVA, já com descontos, em cêntimos. */
  totalCents: number;
}

export interface PosSaleRecord {
  id: string;
  kind: "sale" | "refund";
  documentId: string;
  documentNumber: string;
  employeeId: string;
  employeeName: string;
  paymentMethod: PaymentMethod;
  totalCents: number;
  givenCents: number | null;
  changeCents: number | null;
  /** Devolução: a venda original. */
  refundOf: string | null;
  reason: string | null;
  lines: SoldLine[];
  createdAt: string;
}

/**
 * Movimento de stock do POS (append-only). Venda e devolução vêm do registo da
 * venda; entrada e contagem da gestão. `qty` é a variação (venda < 0).
 */
export interface StockMove {
  id: string;
  productId: string;
  kind: "sale" | "refund" | "entry" | "count";
  qty: number;
  stockBefore: number;
  stockAfter: number;
  saleId: string | null;
  documentNumber: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string;
}

/** Venda que deixou o stock negativo (vendida «na mesma»): é um alerta de stock. */
export const isStockAlert = (m: StockMove): boolean => m.kind === "sale" && m.stockAfter < 0;
