import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { REPORTS, toCsv, type ReportKey, type ReportRow } from "../../domain/entities/report.js";
import { ReportError } from "../../domain/errors.js";
import type { ReportSourcesPort } from "../../domain/ports/out/reports.ports.js";

export { ReportError };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReportsUseCases {
  constructor(private readonly sources: ReportSourcesPort) {}

  catalog() {
    return REPORTS;
  }

  /**
   * Corre um relatório. `canSee` filtra as linhas por colaborador (âmbito de
   * quem consulta); o histórico de alterações exige a permissão de auditoria.
   */
  async run(org: OrganizationId, key: string, period: { from: string; to: string } | null, access: { canSee: (employeeId: string) => Promise<boolean>; canAudit: boolean }) {
    const def = REPORTS.find((r) => r.key === key);
    if (!def) throw new ReportError("Relatório não encontrado.", "not_found");
    if (def.key === "change_history" && !access.canAudit) throw new ReportError("Sem permissão para o histórico de alterações.", "forbidden");
    if (def.needsPeriod) {
      if (!period || !DATE.test(period.from) || !DATE.test(period.to) || period.to < period.from) throw new ReportError("Indique o período.", "validation", "from");
      if (Date.parse(period.to) - Date.parse(period.from) > 366 * 86_400_000) throw new ReportError("Período máximo de um ano.", "validation", "to");
    }
    const all = await this.sources.rows(org, def.key as ReportKey, def.needsPeriod ? period : null);
    const rows: ReportRow[] = [];
    const seen = new Map<string, boolean>();
    for (const r of all) {
      if (def.perEmployee && r.employeeId) {
        if (!seen.has(r.employeeId)) seen.set(r.employeeId, await access.canSee(r.employeeId));
        if (!seen.get(r.employeeId)) continue;
      }
      rows.push(r);
    }
    return { definition: def, rows, csv: () => toCsv(def, rows) };
  }
}
