import type { ListPlatformStatementsPort, PlatformStatementSummary } from "../../domain/ports/in/list-platform-statements.port.js";
import type { PlatformStatementRepositoryPort } from "../../domain/ports/out/platform-statement-repository.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvalidStatementPeriodError } from "../../domain/errors.js";
import { summarizeStatement } from "../../domain/services/statement-summary.js";

const pad = (n: number) => String(n).padStart(2, "0");

export class ListPlatformStatementsUseCase implements ListPlatformStatementsPort {
  constructor(private readonly statements: PlatformStatementRepositoryPort) {}

  async execute({ organizationId, year, month }: { organizationId: OrganizationId; year: number; month: number }): Promise<PlatformStatementSummary[]> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new InvalidStatementPeriodError();
    }
    const from = `${year}-${pad(month)}-01`;
    const to = `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
    const rows = await this.statements.listOverlapping(organizationId, from, to);
    return rows.map(summarizeStatement).sort((a, b) => a.platform.localeCompare(b.platform) || a.periodFrom.localeCompare(b.periodFrom));
  }
}
