import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { MarginReport } from "../../domain/entities/margin-report.js";
import { InvalidStatementPeriodError } from "../../domain/errors.js";
import type {
  ExportPlatformMarginReportPort,
  GetPlatformMarginReportPort,
  MarginReportFile,
  MarginReportFormat,
} from "../../domain/ports/in/platform-margin-report.port.js";
import type { MarginReportWriterPort } from "../../domain/ports/out/margin-report-writer.port.js";
import type { PlatformStatementRepositoryPort } from "../../domain/ports/out/platform-statement-repository.port.js";
import { buildMarginReport } from "../../domain/services/margin-report.service.js";

const pad = (n: number) => String(n).padStart(2, "0");

export class GetPlatformMarginReportUseCase implements GetPlatformMarginReportPort {
  constructor(private readonly statements: PlatformStatementRepositoryPort) {}

  async execute({ organizationId, year, month }: { organizationId: OrganizationId; year: number; month: number }): Promise<MarginReport> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new InvalidStatementPeriodError();
    }
    const from = `${year}-${pad(month)}-01`;
    const to = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
    const inMonth = await this.statements.listOverlapping(organizationId, from, to);
    // Para repartir os documentos que atravessam o mês: SAF-T e pedidos da Bolt de todos os dias que cobrem.
    const wideFrom = inMonth.reduce((a, s) => (s.periodFrom < a ? s.periodFrom : a), from);
    const wideTo = inMonth.reduce((a, s) => (s.periodTo > a ? s.periodTo : a), to);
    const context = wideFrom === from && wideTo === to ? inMonth : await this.statements.listOverlapping(organizationId, wideFrom, wideTo);
    return buildMarginReport(year, month, inMonth, context);
  }
}

const CONTENT_TYPES: Record<MarginReportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export class ExportPlatformMarginReportUseCase implements ExportPlatformMarginReportPort {
  constructor(
    private readonly report: GetPlatformMarginReportPort,
    private readonly writer: MarginReportWriterPort,
  ) {}

  async execute(input: { organizationId: OrganizationId; year: number; month: number; format: MarginReportFormat }): Promise<MarginReportFile> {
    const report = await this.report.execute(input);
    const content = input.format === "pdf" ? await this.writer.pdf(report) : this.writer.xlsx(report);
    return {
      fileName: `margem-delivery-${input.year}-${pad(input.month)}.${input.format}`,
      contentType: CONTENT_TYPES[input.format],
      content,
    };
  }
}
