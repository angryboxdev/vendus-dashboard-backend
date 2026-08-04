// ─── Channel ─────────────────────────────────────────────────────────────────

/**
 * Canal de venda de um documento Vendus.
 *
 * - 'salao'     — consumo no restaurante (preço de salão)
 * - 'eatz'      — delivery próprio (pagamento via método Eatz)
 * - 'take_away' — take-away (preço de salão + item "embalagem")
 *
 * Derivado dos `payments[]` do documento detalhado:
 *   se payments contém o método Eatz  → 'eatz'
 *   se items contém "embalagem"        → 'take_away'
 *   caso contrário                     → 'salao'
 *
 * Na UI, 'take_away' é agrupado com 'salao'.
 */
export type VendusChannel = "salao" | "eatz" | "take_away";

// ─── List document (GET /documents/) ─────────────────────────────────────────

/** Documento da listagem — sem items, payments ou taxes. */
export interface VendusDocument {
  id: number;
  number: string;
  date: string;
  type: string;
  amount_gross: string;
  amount_net: string;
  store_id: number;
  register_id: number;
}

// ─── Detail document (GET /documents/:id/) ───────────────────────────────────

export interface VendusDocumentItem {
  id: number;
  qty: number;
  title: string;
  reference: string;
  amounts: {
    gross_unit?: string;
    gross_total?: string;
    net_unit?: string;
    net_total?: string;
  };
  discounts: { amount?: string; calculated_percentage?: number };
  tax: { rate?: number };
}

export interface VendusDocumentPayment {
  id: number;
  title: string;
  amount: string;
}

export interface VendusDocumentTax {
  total: string;
  base: string;
  amount: string;
  rate: number;
}

/** Documento detalhado como vem da API — sem campos derivados. */
export interface VendusDetailedDocumentRaw {
  id: number;
  type: string;
  number: string;
  date: string;
  system_time: string;
  amount_gross: string;
  amount_net: string;
  taxes: VendusDocumentTax[];
  discounts: { total: string };
  payments: VendusDocumentPayment[];
  client: { name: string; fiscal_id: string };
  items: VendusDocumentItem[];
  related_docs: Array<{ id: number; type: string; number: string }> | null;
  store_id: number;
  register_id: number;
}

/**
 * Documento detalhado enriquecido com campo derivado `channel`.
 * É o que use cases produzem e o que o controller devolve ao frontend.
 */
export interface VendusDetailedDocument extends VendusDetailedDocumentRaw {
  /** Canal derivado dos payments[]. Computado pelo ChannelDetectorService. */
  channel: VendusChannel;
}
