import * as XLSX from "xlsx";
import { mintOrganizationId } from "../../../kernel/organization-id.js";
import { classifyRoute } from "../../access/domain/route-permissions.js";
import { XlsxTableWriterAdapter } from "../adapters/out/xlsx-table-writer.adapter.js";
import { AttendanceDaysUseCases } from "../application/use-cases/attendance-days.use-cases.js";
import { toDayRow, type BoardDay } from "../domain/entities/attendance-days.js";
import type { AttendanceDaysSourcesPort, ReportPerson } from "../domain/ports/out/attendance-days.ports.js";

const ORG = mintOrganizationId("org-a");
const NO_FILTERS = { locationIds: [], groupIds: [], departmentIds: [], employeeIds: [] };

// Dados fictícios (RGPD).
const person = (id: string, over: Partial<ReportPerson> = {}): ReportPerson => ({ id, name: `Pessoa ${id}`, locationId: "porto", hireDate: "2026-01-01", status: "active", deactivatedAt: null, ...over });
const day = (workDate: string, over: Partial<BoardDay> = {}): BoardDay => ({ workDate, workedSeconds: 8 * 3600, theoreticalSeconds: 8 * 3600, incidents: [], excused: false, lateMinutes: 0, ...over });

function setup(people: ReportPerson[], days: Record<string, BoardDay[]>) {
  const asked: string[][] = [];
  const sources: AttendanceDaysSourcesPort = {
    people: async () => people,
    units: async () => new Map([["e1", { groups: ["g-cozinha"], departments: ["d-ops"] }]]),
    daysMany: async (_o, ids) => {
      asked.push(ids);
      return new Map(ids.map((id) => [id, days[id] ?? []]));
    },
  };
  return { uc: new AttendanceDaysUseCases(sources, new XlsxTableWriterAdapter()), asked };
}

describe("Relatórios → Assiduidade por blocos", () => {
  test("linha do dia: atraso, falta (sem ausência), saída esquecida; dias vazios ficam de fora", () => {
    expect(toDayRow("e1", day("2026-10-01", { lateMinutes: 12, incidents: ["late"] }))).toMatchObject({ late: true, lateMinutes: 12, missing: false });
    expect(toDayRow("e1", day("2026-10-02", { workedSeconds: 0, incidents: ["missing_in"] }))).toMatchObject({ missing: true });
    expect(toDayRow("e1", day("2026-10-03", { workedSeconds: 0, incidents: ["missing_in"], excused: true }))).toMatchObject({ missing: false, excused: true });
    expect(toDayRow("e1", day("2026-10-04", { incidents: ["auto_closed"] }))).toMatchObject({ forgotten: true });
    expect(toDayRow("e1", day("2026-10-05", { workedSeconds: 0, theoreticalSeconds: 0 }))).toBeNull();
  });

  test("filtros (centro, grupo, pessoa) e âmbito antes de pedir os dias; antes da admissão não conta", async () => {
    const { uc, asked } = setup(
      [person("e1"), person("e2", { locationId: "lisboa" }), person("e3", { hireDate: "2026-10-02" }), person("e4", { status: "inactive", deactivatedAt: "2026-09-01T00:00:00Z" })],
      { e3: [day("2026-10-01"), day("2026-10-02")] },
    );
    const period = { from: "2026-10-01", to: "2026-10-31" };
    const all = await uc.run(ORG, period, NO_FILTERS, async (id) => id !== "e2");
    expect(all.people.map((p) => p.id)).toEqual(["e1", "e3"]); // e2 fora do âmbito, e4 saiu antes do período
    expect(all.days.map((d) => d.workDate)).toEqual(["2026-10-02"]); // e3 só a partir da admissão
    const porto = await uc.run(ORG, period, { ...NO_FILTERS, locationIds: ["lisboa"] }, async () => true);
    expect(porto.people.map((p) => p.id)).toEqual(["e2"]);
    const grupo = await uc.run(ORG, period, { ...NO_FILTERS, groupIds: ["g-cozinha"] }, async () => true);
    expect(grupo.people.map((p) => p.id)).toEqual(["e1"]);
    expect(asked.at(-1)).toEqual(["e1"]);
  });

  test("no máximo 31 dias por pedido; período inválido dá erro de validação", async () => {
    const { uc } = setup([person("e1")], {});
    await expect(uc.run(ORG, { from: "2026-10-01", to: "2026-11-01" }, NO_FILTERS, async () => true)).rejects.toMatchObject({ code: "validation", field: "to" });
    await expect(uc.run(ORG, { from: "2026-10-05", to: "2026-10-01" }, NO_FILTERS, async () => true)).rejects.toMatchObject({ code: "validation" });
  });

  test("Excel: título, cabeçalho e números; fórmulas neutralizadas; tabela inválida recusada", () => {
    const { uc } = setup([], {});
    const out = uc.exportXlsx({ title: "Assiduidade — Outubro", subtitle: "Loja Porto", columns: ["Colaborador", "Horas"], rows: [["=HYPERLINK(\"x\")", 7.5]] });
    expect(out.name).toBe("assiduidade-outubro.xlsx");
    const sheet = XLSX.read(out.file).Sheets["Relatório"]!;
    expect(sheet.A1.v).toBe("Assiduidade — Outubro");
    expect(sheet.A4.v).toBe("Colaborador");
    expect(sheet.A5.v).toBe("'=HYPERLINK(\"x\")");
    expect(sheet.B5.v).toBe(7.5);
    expect(() => uc.exportXlsx({ title: "x", subtitle: "", columns: ["a"], rows: [["1", "2"]] })).toThrow("Linhas inválidas.");
  });

  test("permissões: exportar é leitura de hr.employees; os dias também", () => {
    expect(classifyRoute("POST", "/api/novo-rh/reports/export/xlsx")).toEqual({ target: { kind: "permission", key: "hr.employees", level: "READ" }, level: "READ" });
    expect(classifyRoute("GET", "/api/novo-rh/reports/attendance/days").level).toBe("READ");
  });
});
