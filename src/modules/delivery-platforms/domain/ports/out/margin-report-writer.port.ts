import type { MarginReport } from "../../entities/margin-report.js";

/** Escreve o relatório de margem num ficheiro (Excel ou PDF). */
export interface MarginReportWriterPort {
  xlsx(report: MarginReport): Uint8Array;
  pdf(report: MarginReport): Promise<Uint8Array>;
}
