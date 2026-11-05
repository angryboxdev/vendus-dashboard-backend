/**
 * POS do Mezza (fase 1): produtos vendidos na caixa, vendas e devoluções.
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
  /** Controla stock (bebidas); o contador é da fase 2. */
  trackStock: boolean;
  imageUrl: string | null;
  active: boolean;
}

export type NewPosProduct = Omit<PosProduct, "id" | "active">;

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
}

export interface PosSettings {
  /** Série de faturas-recibo (FR) usada pelo POS. */
  invoiceSeriesRef: string | null;
  /** Série de notas de crédito (NC). */
  creditSeriesRef: string | null;
  managerEmployeeIds: string[];
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
