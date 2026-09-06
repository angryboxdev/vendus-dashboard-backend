import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SalesSummaryResult } from "../../entities/sales-summary.js";

export interface GetSalesSummaryParams {
  organizationId: OrganizationId;
  year: number;
  month: number;
  /** When true, bypass cache read (still writes after calculation). */
  forceRefresh: boolean;
}

export interface GetSalesSummaryPort {
  execute(params: GetSalesSummaryParams): Promise<SalesSummaryResult>;
}
