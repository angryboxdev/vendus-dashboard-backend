import { mintOrganizationId } from "../../../kernel/organization-id.js";
import { ReportsUseCases } from "../application/use-cases/reports.use-cases.js";
import type { ReportKey, ReportRow } from "../domain/entities/report.js";

const ORG = mintOrganizationId("org-a");

const data: Record<ReportKey, ReportRow[]> = {
  attendance: [
    { employeeId: "e1", employee: "Ana Teste", worked: 160, theoretical: 168, difference: -8, night: 0, pending: 0, openIncidents: 1 },
    { employeeId: "e2", employee: "=HYPERLINK(\"x\")", worked: 170, theoretical: 168, difference: 2, night: 4, pending: 0, openIncidents: 0 },
  ],
  balances: [],
  absences: [],
  incomplete_data: [{ employeeId: "e2", employee: "Bruno", missing: "NIF, Contrato ativo" }],
  contracts: [],
  change_history: [{ when: "2026-10-12 10:00", actor: "rh@demo.invalid", action: "people.update", resource: "employee", reason: "" }],
};

const uc = new ReportsUseCases({
  rows: async (_o, key) => data[key],
  employeeLocations: async () => new Map([
    ["e1", "porto"],
    ["e2", "lisboa"],
  ]),
});
const all = { canSee: async () => true, canAudit: true };

describe("Relatórios", () => {
  test("catálogo por grupos; o histórico só para quem pode auditar", () => {
    expect(uc.catalog().map((r) => r.key)).toEqual(["attendance", "balances", "absences", "incomplete_data", "contracts", "change_history"]);
    expect(uc.catalog()[0]).toMatchObject({ group: "time", groupLabel: "Assiduidade e banco de horas" });
    expect(uc.catalog(false).map((r) => r.key)).not.toContain("change_history");
  });

  test("FE-063: filtros por centro e por pessoa e escolha de colunas (só as da definição)", async () => {
    const period = { from: "2026-10-01", to: "2026-10-31" };
    const porto = await uc.run(ORG, "attendance", period, all, { locationIds: ["porto"], employeeIds: [], columns: [] });
    expect(porto.rows.map((x) => x.employeeId)).toEqual(["e1"]);
    const e2 = await uc.run(ORG, "attendance", period, all, { locationIds: [], employeeIds: ["e2"], columns: ["employee", "worked"] });
    expect(e2.rows).toEqual([{ employeeId: "e2", employee: "=HYPERLINK(\"x\")", worked: 170 }]);
    expect(e2.csv().split("\r\n")[0]).toBe("﻿Colaborador;Trabalhado (h)");
    // Uma coluna que não existe na definição (ex.: IBAN) é recusada.
    await expect(uc.run(ORG, "attendance", period, all, { locationIds: [], employeeIds: [], columns: ["employee", "iban"] })).rejects.toMatchObject({ field: "columns" });
    // O filtro por pessoa nunca alarga o âmbito.
    const scoped = await uc.run(ORG, "attendance", period, { canSee: async (id) => id === "e1", canAudit: false }, { locationIds: [], employeeIds: ["e2"], columns: [] });
    expect(scoped.rows).toEqual([]);
  });

  test("filtra pelo âmbito de quem consulta e exige período quando é preciso", async () => {
    await expect(uc.run(ORG, "attendance", null, all)).rejects.toMatchObject({ field: "from" });
    const r = await uc.run(ORG, "attendance", { from: "2026-10-01", to: "2026-10-31" }, { canSee: async (id) => id === "e1", canAudit: false });
    expect(r.rows.map((x) => x.employeeId)).toEqual(["e1"]);
    expect((await uc.run(ORG, "incomplete_data", null, all)).rows[0]).toMatchObject({ missing: "NIF, Contrato ativo" });
  });

  test("histórico de alterações só com permissão de auditoria", async () => {
    await expect(uc.run(ORG, "change_history", { from: "2026-10-01", to: "2026-10-31" }, { canSee: async () => true, canAudit: false })).rejects.toMatchObject({ code: "forbidden" });
    await expect(uc.run(ORG, "change_history", { from: "2026-10-01", to: "2026-10-31" }, all)).resolves.toBeTruthy();
    await expect(uc.run(ORG, "nao-existe", null, all)).rejects.toMatchObject({ code: "not_found" });
  });

  test("CSV com cabeçalhos em português, decimais com vírgula e fórmulas neutralizadas", async () => {
    const csv = (await uc.run(ORG, "attendance", { from: "2026-10-01", to: "2026-10-31" }, all)).csv();
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Colaborador;Trabalhado (h);Teórico (h);Diferença (h);Noturno (h);Pendente (h);Incidentes abertos");
    expect(lines[1]).toBe("Ana Teste;160;168;-8;0;0;1");
    expect(lines[2]!.startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
  });
});
