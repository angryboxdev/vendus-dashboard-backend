import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { pickColumns, REPORT_GROUPS, REPORTS, toCsv, type ReportFilters, type ReportKey, type ReportRow } from "../../domain/entities/report.js";
import { ReportError } from "../../domain/errors.js";
import type { ReportSourcesPort } from "../../domain/ports/out/reports.ports.js";

export { ReportError };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NO_FILTERS: ReportFilters = { locationIds: [], employeeIds: [], columns: [] };

export class ReportsUseCases {
  constructor(private readonly sources: ReportSourcesPort) {}

  /** Catálogo por grupos; o histórico de alterações só aparece a quem pode auditar. */
  catalog(canAudit = true) {
    return REPORTS.filter((r) => canAudit || r.key !== "change_history").map((r) => ({ ...r, groupLabel: REPORT_GROUPS.find((g) => g.key === r.group)!.label }));
  }

  /**
   * Corre um relatório. `canSee` filtra as linhas por colaborador (âmbito de
   * quem consulta); depois aplicam-se os filtros por centro e por pessoa e a
   * escolha de colunas (só as da definição).
   */
  async run(
    org: OrganizationId,
    key: string,
    period: { from: string; to: string } | null,
    access: { canSee: (employeeId: string) => Promise<boolean>; canAudit: boolean },
    filters: ReportFilters = NO_FILTERS,
  ) {
    const def = REPORTS.find((r) => r.key === key);
    if (!def) throw new ReportError("Relatório não encontrado.", "not_found");
    if (def.key === "change_history" && !access.canAudit) throw new ReportError("Sem permissão para o histórico de alterações.", "forbidden");
    if (def.needsPeriod) {
      if (!period || !DATE.test(period.from) || !DATE.test(period.to) || period.to < period.from) throw new ReportError("Indique o período.", "validation", "from");
      if (Date.parse(period.to) - Date.parse(period.from) > 366 * 86_400_000) throw new ReportError("Período máximo de um ano.", "validation", "to");
    }
    const columns = pickColumns(def, filters.columns);
    if (!columns || !columns.length) throw new ReportError("Coluna não disponível neste relatório.", "validation", "columns");
    const all = await this.sources.rows(org, def.key as ReportKey, def.needsPeriod ? period : null);
    const byLocation = def.perEmployee && filters.locationIds.length ? await this.sources.employeeLocations(org) : null;
    const rows: ReportRow[] = [];
    const seen = new Map<string, boolean>();
    for (const r of all) {
      if (def.perEmployee && r.employeeId) {
        if (!seen.has(r.employeeId)) seen.set(r.employeeId, await access.canSee(r.employeeId));
        if (!seen.get(r.employeeId)) continue;
        if (filters.employeeIds.length && !filters.employeeIds.includes(r.employeeId)) continue;
        if (byLocation && !filters.locationIds.includes(byLocation.get(r.employeeId) ?? "")) continue;
      }
      const out: ReportRow = r.employeeId ? { employeeId: r.employeeId } : {};
      for (const c of columns) out[c.key] = r[c.key] ?? "";
      rows.push(out);
    }
    return { definition: def, columns, rows, csv: () => toCsv(columns, rows) };
  }
}
