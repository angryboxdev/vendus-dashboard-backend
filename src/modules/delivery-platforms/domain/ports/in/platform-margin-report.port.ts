import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { MarginReport } from "../../entities/margin-report.js";

export type MarginReportFormat = "xlsx" | "pdf";

export interface MarginReportFile {
  fileName: string;
  contentType: string;
  content: Uint8Array;
}

/** Relatório de margem por plataforma de um mês. */
export interface GetPlatformMarginReportPort {
  execute(input: { organizationId: OrganizationId; year: number; month: number }): Promise<MarginReport>;
}

/** O mesmo relatório em Excel ou PDF, para descarregar. */
export interface ExportPlatformMarginReportPort {
  execute(input: { organizationId: OrganizationId; year: number; month: number; format: MarginReportFormat }): Promise<MarginReportFile>;
}
