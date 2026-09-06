import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { MonthlyGrowthPoint } from "../../entities/sales-summary.js";

export interface GetGrowthChartParams {
  organizationId: OrganizationId;
  year: number;
}

export interface GetGrowthChartPort {
  execute(params: GetGrowthChartParams): Promise<MonthlyGrowthPoint[]>;
}
