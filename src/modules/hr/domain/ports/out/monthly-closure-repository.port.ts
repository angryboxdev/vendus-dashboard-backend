import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { MonthlyClosure } from "../../entities/monthly-closure.js";

export interface MonthlyClosureRepositoryPort {
  findByPeriod(organizationId: OrganizationId, year: number, month: number): Promise<MonthlyClosure | null>;
  save(organizationId: OrganizationId, closure: MonthlyClosure): Promise<MonthlyClosure>;
}
