/**
 * Output port — AirMenu data needed by the sales-summary calculator.
 *
 * All types are defined here; no imports from the air-menu module domain.
 */

export type AirMenuSourcePlatform = "uber_eats" | "glovo" | "bolt_food";

export interface AirMenuChannelData {
  channel: AirMenuSourcePlatform;
  /** Invoices minus NC for this platform (cents). */
  grossRevenueCents: number;
  invoiceCount: number;
  creditNoteCount: number;
  creditNoteValueCents: number;
}

export interface AirMenuCategoryData {
  /** Raw AirMenu category name (e.g. "Pizzas", "Drinks", "Outros"). */
  category: string;
  itemsSold: number;
  grossRevenueCents: number;
  vatCollectedCents: number;
  netRevenueCents: number;
}

export interface AirMenuProductData {
  normalizedTitle: string;
  quantitySold: number;
  grossRevenueCents: number;
  channelsSeen: AirMenuSourcePlatform[];
}

export interface AirMenuHourlyBucket {
  hour: number;
  invoiceCount: number;
  creditNoteCount: number;
  /** NC contribute negatively (cents). */
  grossRevenueCents: number;
}

export interface AirMenuSummaryData {
  /** Total invoice gross before NC subtraction (cents). */
  faturadoTotalCents: number;
  /** VAT on the net period (cents). */
  invoiceVatCollectedCents: number;
  invoiceCount: number;
  creditNoteCount: number;
  /** Positive absolute value of NC (cents). */
  creditNoteValueCents: number;
  byChannel: AirMenuChannelData[];
  byCategory: AirMenuCategoryData[];
  topProducts: AirMenuProductData[];
  temporalDistribution: AirMenuHourlyBucket[];
}

export interface AirMenuSummaryPort {
  getSummary(year: number, month: number): Promise<AirMenuSummaryData>;
}
