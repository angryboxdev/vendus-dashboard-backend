/**
 * Output port — Vendus data needed by the sales-summary calculator.
 *
 * All types are defined here; no imports from the vendus module domain.
 */

export type VendusSourceCategory =
  | "pizza"
  | "bebida_alcoolica"
  | "bebida_nao_alcoolica"
  | "sacos"
  | "outros";

export type VendusSourceChannel = "salao" | "take_away" | "eatz" | "apps";

export interface VendusChannelData {
  channel: VendusSourceChannel;
  /** Invoices minus NC for this channel (cents). */
  grossRevenueCents: number;
  invoiceCount: number;
  creditNoteCount: number;
  creditNoteValueCents: number;
}

export interface VendusCategoryData {
  category: VendusSourceCategory;
  itemsSold: number;
  grossRevenueCents: number;
  vatCollectedCents: number;
  netRevenueCents: number;
}

export interface VendusProductData {
  normalizedTitle: string;
  category: VendusSourceCategory;
  quantitySold: number;
  grossRevenueCents: number;
  channelsSeen: VendusSourceChannel[];
}

export interface VendusHourlyBucket {
  hour: number;
  invoiceCount: number;
  creditNoteCount: number;
  /** NC contribute negatively (cents). */
  grossRevenueCents: number;
}

export interface VendusSummaryData {
  /** Total invoice gross before NC subtraction (cents). */
  faturadoTotalCents: number;
  /** VAT on invoices (cents). */
  invoiceVatCollectedCents: number;
  invoiceCount: number;
  creditNoteCount: number;
  /** Positive absolute value of NC (cents). */
  creditNoteValueCents: number;
  byChannel: VendusChannelData[];
  byCategory: VendusCategoryData[];
  topProducts: VendusProductData[];
  temporalDistribution: VendusHourlyBucket[];
}

export interface VendusSummaryPort {
  getSummary(year: number, month: number): Promise<VendusSummaryData>;
}
