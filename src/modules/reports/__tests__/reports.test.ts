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
  change_history: [{ when: "2026-10-12 10:00", actor: "rh@demo.invalid", action: "people.update", resource: "employee", reason: "" }],
};

const uc = new ReportsUseCases({ rows: async (_o, key) => data[key] });
const all = { canSee: async () => true, canAudit: true };

describe("Relatórios", () => {
  test("catálogo com os 5 prioritários", () => {
    expect(uc.catalog().map((r) => r.key)).toEqual(["attendance", "balances", "absences", "incomplete_data", "change_history"]);
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
