import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ReportKey, ReportRow } from "../../entities/report.js";

/** Cada relatório lê dos módulos donos dos dados (ligado no composition root). */
export interface ReportSourcesPort {
  rows(org: OrganizationId, key: ReportKey, period: { from: string; to: string } | null): Promise<ReportRow[]>;
}
