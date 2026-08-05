import type { VendusCategory } from "./vendus-product.js";

// ─── Summary ──────────────────────────────────────────────────────────────────

export interface VendusSummaryStats {
  totalDocuments: number;
  totalCreditNotes: number;
  grossRevenue: number;
  vatCollected: number;
  netRevenue: number;
  averageTicket: number;
}

// ─── By channel ───────────────────────────────────────────────────────────────

/**
 * Breakdown por canal de venda.
 * 'take_away' é agrupado com 'salao' — apenas dois canais: salao e eatz.
 * `takeAwayCount` regista quantos dos documentos de salão são take-away.
 */
export interface VendusChannelStats {
  channel: "salao" | "eatz";
  documentCount: number;
  creditNoteCount: number;
  grossRevenue: number;
  vatCollected: number;
  netRevenue: number;
  averageTicket: number;
  takeAwayCount: number;
}

// ─── By category ─────────────────────────────────────────────────────────────

export interface VendusCategoryStats {
  category: VendusCategory;
  quantitySold: number;
  grossRevenue: number;
  vatCollected: number;
  netRevenue: number;
}

// ─── By VAT rate ─────────────────────────────────────────────────────────────

export interface VendusVatRateStats {
  rate: number;
  grossRevenue: number;
  vatAmount: number;
  netRevenue: number;
}

// ─── Top products ─────────────────────────────────────────────────────────────

export interface VendusTopProduct {
  reference: string;
  title: string;
  category: VendusCategory;
  vatRate: number;
  quantitySold: number;
  grossRevenue: number;
}

// ─── Products by channel ──────────────────────────────────────────────────────

export interface VendusProductChannelBreakdown {
  reference: string;
  title: string;
  category: VendusCategory;
  vatRate: number;
  quantitySold: number;
  byChannel: {
    salao: number;
    take_away: number;
    eatz: number;
  };
  grossRevenue: number;
}

// ─── Temporal distribution ───────────────────────────────────────────────────

export interface VendusTemporalPoint {
  /** 'HH:00' para período de 1 dia; 'YYYY-MM-DD' para múltiplos dias. */
  period: string;
  documentCount: number;
  grossRevenue: number;
}

// ─── Full analytics ───────────────────────────────────────────────────────────

export interface VendusAnalytics {
  summary: VendusSummaryStats;
  byChannel: VendusChannelStats[];
  byCategory: VendusCategoryStats[];
  byVatRate: VendusVatRateStats[];
  byDocumentType: {
    invoices: { count: number; grossRevenue: number };
    creditNotes: { count: number; grossRevenue: number };
  };
  topProducts: VendusTopProduct[];
  productsByChannel: VendusProductChannelBreakdown[];
  temporalDistribution: VendusTemporalPoint[];
}

// ─── Analytics current (fast — list docs only) ────────────────────────────────

export interface AnalyticsCurrentResponse {
  period: {
    year: number;
    month: number;
    from: string;
    to: string;
    is_current_month: boolean;
    documents_count: number;
  };
  today: {
    gross: number;
    documents_count: number;
    vs_daily_avg_pct: number;
    is_below_threshold: boolean;
  } | null;
  month: {
    gross: number;
    documents_count: number;
    days_elapsed: number;
    days_in_month: number;
    daily_avg: number;
    expected_gross: number;
    pct_of_expected: number;
    avg_ticket: number;
  };
  by_weekday: WeekdayEntry[];
  debug: { took_ms: number };
}

export interface WeekdayEntry {
  weekday: number;
  label: string;
  gross: number;
  avg_gross: number;
  days_count: number;
  documents_count: number;
}

// ─── Analytics historical (cache-aware) ───────────────────────────────────────

export interface AnalyticsHistoricalResponse {
  annual: { gross: number; year: number; documents_count: number };
  historical: { gross: number; since: string; documents_count: number };
  monthly_growth: GrowthSlot[];
  comparisons: {
    prev_month: {
      year: number;
      month: number;
      label: string;
      gross: number;
      daily_avg: number;
      avg_ticket: number;
      documents_count: number;
    } | null;
    prev_year_ytd: {
      year: number;
      gross: number;
      documents_count: number;
    } | null;
  };
  debug: { took_ms: number; history_start_year: number };
}

export interface GrowthSlot {
  year: number;
  month: number;
  label: string;
  gross: number;
  documents_count: number;
}
