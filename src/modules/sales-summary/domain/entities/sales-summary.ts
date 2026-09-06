// ─── Channels ─────────────────────────────────────────────────────────────────

/**
 * Canonical sales channels across Vendus and AirMenu.
 * 'apps' is a legacy Vendus channel (pre-AirMenu); present only when
 * historical data exists.
 */
export type UnifiedChannel =
  | "salao"
  | "take_away"
  | "eatz"
  | "uber_eats"
  | "glovo"
  | "bolt_food"
  | "apps";

// ─── Categories ───────────────────────────────────────────────────────────────

export type UnifiedCategory =
  | "Pizzas"
  | "Bebidas Alcoólicas"
  | "Bebidas"
  | "Outros";

// ─── Totals ───────────────────────────────────────────────────────────────────

export interface SalesSummaryTotals {
  /** Invoices minus NC, with VAT (cents). */
  grossRevenue: number;
  /** All invoices before NC subtraction (cents). */
  faturadoTotal: number;
  /** VAT collected on invoices (cents). */
  vatCollected: number;
  /** grossRevenue minus vatCollected (cents). */
  netRevenue: number;
  /** Invoice count (NC excluded). */
  transactionCount: number;
  /** grossRevenue / transactionCount (cents). */
  averageTicket: number;
  creditNoteCount: number;
  /** Positive absolute value of credit notes (cents). */
  creditNoteValue: number;
}

// ─── By-channel breakdown ─────────────────────────────────────────────────────

export interface ChannelSummary {
  channel: UnifiedChannel;
  /** Invoices minus NC for this channel (cents). */
  grossRevenue: number;
  transactionCount: number;
  averageTicket: number;
  /** Percentage of total grossRevenue (2 decimal places). */
  sharePercent: number;
}

// ─── By-category breakdown ────────────────────────────────────────────────────

export interface CategorySummary {
  category: UnifiedCategory;
  itemsSold: number;
  grossRevenue: number;   // cents
  vatCollected: number;   // cents
  netRevenue: number;     // cents
}

// ─── Top products ─────────────────────────────────────────────────────────────

export interface ProductRanking {
  normalizedTitle: string;
  quantitySold: number;
  grossRevenue: number;     // cents
  channels: UnifiedChannel[];
}

// ─── Temporal distribution ────────────────────────────────────────────────────

export interface TimeBucket {
  hour: number;             // 0–23
  invoiceCount: number;
  creditNoteCount: number;
  /** NC contribute negatively (cents). */
  grossRevenue: number;
}

// ─── Full result ──────────────────────────────────────────────────────────────

export interface SalesSummaryResult {
  period: { year: number; month: number };
  /** Timestamp of the cache entry that produced this result. */
  cachedAt: Date;
  totals: SalesSummaryTotals;
  byChannel: ChannelSummary[];
  byCategory: CategorySummary[];
  /** Always top 50, ordered by grossRevenue descending. UI slices. */
  topProducts: ProductRanking[];
  temporalDistribution: TimeBucket[];
}

// ─── Growth chart ─────────────────────────────────────────────────────────────

export interface MonthlyGrowthPoint {
  year: number;
  month: number;
  vendusRevenue: number;    // cents
  airMenuRevenue: number;   // cents
  totalRevenue: number;     // cents
  /** null only if this month was never computed (future or failed). */
  cachedAt: Date | null;
}
