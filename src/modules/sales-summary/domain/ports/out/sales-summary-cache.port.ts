import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SalesSummaryResult } from "../../entities/sales-summary.js";

export interface SaveCacheParams {
  payload: SalesSummaryResult;
  /** Vendus gross revenue for the period (cents) — denormalized for growth chart. */
  vendusRevenueCents: number;
  /** AirMenu gross revenue for the period (cents) — denormalized for growth chart. */
  airMenuRevenueCents: number;
}

export interface MonthlyGrowthRow {
  year: number;
  month: number;
  totalRevenueCents: number;
  vendusRevenueCents: number;
  airMenuRevenueCents: number;
  calculatedAt: Date;
}

/**
 * Output port — persistent cache for computed SalesSummaryResult.
 *
 * organizationId is always the first parameter (D2 pattern).
 */
export interface SalesSummaryCachePort {
  get(
    organizationId: OrganizationId,
    year: number,
    month: number,
  ): Promise<{ payload: SalesSummaryResult; calculatedAt: Date } | null>;

  save(
    organizationId: OrganizationId,
    year: number,
    month: number,
    params: SaveCacheParams,
  ): Promise<void>;

  /** Light read used by the growth chart — no payload deserialization. */
  getYearMonths(
    organizationId: OrganizationId,
    year: number,
  ): Promise<MonthlyGrowthRow[]>;
}
