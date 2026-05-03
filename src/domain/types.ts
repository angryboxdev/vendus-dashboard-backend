export type Channel = "restaurant" | "delivery" | "take_away" | "unknown";

export type VendusDocument = {
  id: number;
  number: string;
  date: string;
  store_id: number;
  register_id: number;
  date_due: string;
  system_time: string;
  local_time: string;
  amount_gross: string;
  amount_net: string;
  type: string;
  status: string;
  total_unpaid: number;
  payment_status: string;
};

export type VendusDetailedDocument = {
  id: number;
  type: string;
  number: string;
  date: string;
  system_time: string;
  local_time: string;
  amount_gross: string;
  amount_net: string;
  date_due: string;
  observations: string;
  external_reference: string;
  has_travel_tax_free: boolean;
  store_id: number;
  register_id: number;
  user_id: number;
  taxes: Array<{ total: string; base: string; amount: string; rate: number }>;
  discounts: { total: string };
  payments: Array<{
    id: number;
    title: string;
    amount: string;
  }>;
  client: { name: string; fiscal_id: string };
  items: VendusDocumentItem[];
  status: { id: string; date: string; user_id: number };
  debt: { total: string; paid: string; unpaid: string };
  related_docs:
    | {
        id: number;
        type: string;
        number: string;
      }[]
    | null;
  hash: string;
  atcud: string;
};

export type VendusDocumentItem = {
  id: number;
  qty: number;
  type_id: string;
  title: string;
  reference: string;
  stock_control: number;
  amounts: {
    gross_unit?: string;
    gross_total?: string;
    net_unit?: string;
    net_total?: string;
  };
  discounts: { amount?: string; calculated_percentage?: number };
  tax: { rate?: number; [key: string]: unknown };
  qty_nc?: number;
};

export type Category =
  | "pizza"
  | "bebida_alcoolica"
  | "bebida_nao_alcoolica"
  | "sacos"
  | "outros";


export type AggTotals = {
  gross: number;
  net: number;
  tax_amount: number;
  units_count: number;
  documents_count: number;
  items_count: number;
};

export type ProductAgg = {
  reference: string;
  title: string;
  category: Category;
  tax_rate: number;
  qty: number;
  amounts: {
    gross_total: number;
    net_total: number;
    tax_total: number;
    avg_gross_unit: number;
    avg_net_unit: number;
  };
  channels: {
    restaurant: { qty: number; gross_total: number; net_total: number };
    delivery: { qty: number; gross_total: number; net_total: number };
    take_away: { qty: number; gross_total: number; net_total: number };
    unknown: { qty: number; gross_total: number; net_total: number };
  };
};

export type ChannelReport = {
  totals: AggTotals;
  byCategory: Record<
    Category,
    {
      totals: AggTotals;
      products: ProductAgg[];
    }
  >;
};

export type Debug = {
  took_ms: number;
  pages_fetched: number;
  documents_fetched: number;
  documents_detailed_fetched: number;
  rate_limit_notes: string;
  unknown_items_count: number;
  unknown_items_sample: Array<{
    doc_id: number | string;
    doc_number: string;
    title: string;
    reference: string;
    qty: number;
    gross_unit: number;
    gross_total: number;
  }>;
  price_map: {
    version: number;
    tolerance: number;
    mapped_products_count: number;
  };
};

/**
 * Produto consumido num registo de autoconsumo (referência + nome + quantidade).
 * Presente em cada elemento de `VendusSelfConsumptionSummary.records[].products` após enriquecimento.
 */
export type VendusSelfConsumptionProductLine = {
  reference: string;
  title: string;
  qty: number;
};

/** Dados brutos do endpoint Vendus GET /selfconsumption/ (autoconsumo). */
export type VendusSelfConsumptionSummary = {
  date_start: string;
  date_end: string;
  store_id: number | null;
  total_spending: number | null;
  records_count: number;
  /**
   * Registos com `products` normalizados (`reference`, `title`, `qty`).
   * Quando a listagem vem sem produtos, o backend chama GET `/selfconsumption/{id}/` para os preencher.
   */
  records: unknown[];
  pages_fetched: number;
  /** Quantidade de pedidos de detalhe feitos à API (IDs únicos que precisavam de enriquecimento). */
  details_fetched?: number;
  /** True se existiam mais registos sem produtos do que o limite `SELFCONSUMPTION_MAX_DETAIL_FETCHES`. */
  details_fetch_truncated?: boolean;
  /** Se a chamada à API falhou (rede, 401, etc.). */
  error?: string;
};

export type MonthlySummaryResponse = {
  period: { since: string; until: string; timezone: string };
  source: {
    store_id: number | null;
    documents_count: number;
    documents_types: string[];
  };
  totals: {
    gross: number;
    net: number;
    tax_amount: number;
    tax_breakdown: Array<{
      rate: number;
      base: number;
      amount: number;
      total: number;
    }>;
    units_count: number;
    documents_count: number;
    items_count: number;
  };
  by_channel: {
    restaurant: ChannelReport;
    delivery: ChannelReport;
    unknown: {
      totals: AggTotals;
      notes: string;
      by_category: ChannelReport["byCategory"];
    };
  };
  by_category_overall: Record<Category, { totals: AggTotals }>;
  products_overall: ProductAgg[];
  /** Autoconsumo interno (Vendus API selfconsumption) no mesmo período `since`/`until`. */
  vendus_selfconsumption?: VendusSelfConsumptionSummary;
  debug: Debug;
};
