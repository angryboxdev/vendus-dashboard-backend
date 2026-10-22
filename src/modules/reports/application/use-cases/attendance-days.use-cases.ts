import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { ATTENDANCE_DAYS_MAX, exportTableProblem, toDayRow, type AttendanceDayRow, type AttendanceDaysFilters, type ExportTable } from "../../domain/entities/attendance-days.js";
import { ReportError } from "../../domain/errors.js";
import type { AttendanceDaysSourcesPort, ReportPerson, TableWriterPort } from "../../domain/ports/out/attendance-days.ports.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

/**
 * Relatório de assiduidade por blocos: quem entra (âmbito de quem consulta,
 * depois centro / grupo / departamento / pessoa) e os dias apurados de cada um.
 * O ecrã pede o período em blocos de até 31 dias e soma por semana, mês ou total.
 */
export class AttendanceDaysUseCases {
  constructor(
    private readonly sources: AttendanceDaysSourcesPort,
    private readonly writer: TableWriterPort,
  ) {}

  async run(
    org: OrganizationId,
    period: { from: string; to: string },
    filters: AttendanceDaysFilters,
    canSee: (employeeId: string) => Promise<boolean>,
  ): Promise<{ people: ReportPerson[]; days: AttendanceDayRow[] }> {
    const { from, to } = period;
    if (!DATE.test(from) || !DATE.test(to) || to < from) throw new ReportError("Indique o período.", "validation", "from");
    if (days(from, to) > ATTENDANCE_DAYS_MAX) throw new ReportError(`Máximo de ${ATTENDANCE_DAYS_MAX} dias por pedido.`, "validation", "to");

    // Ativos e quem saiu durante o período (as horas desses dias contam).
    const all = (await this.sources.people(org)).filter((p) => p.status === "active" || (p.deactivatedAt !== null && p.deactivatedAt.slice(0, 10) >= from));
    const units = filters.groupIds.length || filters.departmentIds.length ? await this.sources.units(org, to) : null;
    const people: ReportPerson[] = [];
    for (const p of all) {
      if (filters.employeeIds.length && !filters.employeeIds.includes(p.id)) continue;
      if (filters.locationIds.length && !filters.locationIds.includes(p.locationId ?? "")) continue;
      if (units) {
        const u = units.get(p.id) ?? { groups: [], departments: [] };
        if (filters.groupIds.length && !u.groups.some((g) => filters.groupIds.includes(g))) continue;
        if (filters.departmentIds.length && !u.departments.some((d) => filters.departmentIds.includes(d))) continue;
      }
      if (!(await canSee(p.id))) continue;
      people.push(p);
    }
    if (!people.length) return { people: [], days: [] };

    const boards = await this.sources.daysMany(org, people.map((p) => p.id), from, to);
    const rows: AttendanceDayRow[] = [];
    for (const p of people) {
      for (const d of boards.get(p.id) ?? []) {
        // Antes da admissão não conta (o motor pode ter planeado pelo horário).
        if (p.hireDate && d.workDate < p.hireDate) continue;
        const row = toDayRow(p.id, d);
        if (row) rows.push(row);
      }
    }
    return { people: people.sort((a, b) => a.name.localeCompare(b.name, "pt")), days: rows };
  }

  /** Excel de uma tabela já calculada no ecrã (sem dados novos: só formata). */
  exportXlsx(table: unknown): { file: Buffer; name: string } {
    const problem = exportTableProblem(table);
    if (problem) throw new ReportError(problem, "validation", "rows");
    const t = table as ExportTable;
    const name = `${t.title.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "relatorio"}.xlsx`;
    return { file: this.writer.xlsx(t), name };
  }
}
