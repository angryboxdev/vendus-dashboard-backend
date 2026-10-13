import { DateTime } from "luxon";
import { generateDemoDataset } from "../../domain/services/demo-dataset.generator.js";

const OPTS = { seed: 7, employeesPerCenter: 12, from: "2026-10-19", to: "2026-11-01" };

describe("gerador de dados de demonstração", () => {
  test("determinístico: mesma semente → mesmo conjunto; outra semente → outro", () => {
    expect(JSON.stringify(generateDemoDataset(OPTS))).toBe(JSON.stringify(generateDemoDataset(OPTS)));
    expect(generateDemoDataset({ ...OPTS, seed: 8 }).employees[0]).not.toEqual(generateDemoDataset(OPTS).employees[0]);
  });

  test("foto fictícia por pessoa: ilustração do grupo do nome, a rodar pelo conjunto", () => {
    const ds = generateDemoDataset(OPTS);
    const ana = ds.employees.find((e) => e.firstName === "Ana");
    const rui = ds.employees.find((e) => e.firstName === "Rui");
    if (ana) expect(ana.photoPath).toMatch(/^demo-avatars\/f-\d{2}\.svg$/);
    if (rui) expect(rui.photoPath).toMatch(/^demo-avatars\/m-\d{2}\.svg$/);
    expect(new Set(ds.employees.map((e) => e.photoPath)).size).toBeGreaterThan(12);
  });

  test("2 organizações, centros em PT e ES com fusos diferentes", () => {
    const ds = generateDemoDataset(OPTS);
    expect(ds.tenants).toHaveLength(2);
    for (const t of ds.tenants) {
      const zones = new Set(ds.centers.filter((c) => c.tenantKey === t.key).map((c) => c.timeZone));
      expect(zones).toEqual(new Set(["Europe/Lisbon", "Europe/Madrid"]));
    }
    expect(ds.employees).toHaveLength(4 * 12);
  });

  test("RGPD: tudo marcado como sintético, e-mails .invalid, sem campos de identificação", () => {
    const ds = generateDemoDataset(OPTS);
    for (const e of ds.employees) {
      expect(e.synthetic).toBe(true);
      expect(e.email.endsWith("@demo.invalid")).toBe(true);
      expect(e.employeeNumber.startsWith("DEMO-")).toBe(true);
      expect(Object.keys(e)).not.toEqual(expect.arrayContaining(["nif", "niss", "iban", "address"]));
    }
    expect(new Set(ds.punches.map((p) => p.clientEventId)).size).toBe(ds.punches.length);
  });

  test("turno noturno: a saída é no dia seguinte e pertence ao dia de início", () => {
    const ds = generateDemoDataset(OPTS);
    const night = ds.employees.find((e) => ds.schedules.find((s) => s.key === e.scheduleKey)?.name === "Noite")!;
    const out = ds.punches.find((p) => p.employeeKey === night.key && p.kind === "out")!;
    const local = DateTime.fromISO(out.atUtc).setZone(out.timeZone);
    expect(local.toISODate()).toBe(DateTime.fromISO(out.workDate).plus({ days: 1 }).toISODate());
  });

  test("mudança de hora (25/10/2026): mesma hora local, offset UTC diferente", () => {
    const ds = generateDemoDataset({ ...OPTS, employeesPerCenter: 30 });
    const porto = ds.punches.filter((p) => p.timeZone === "Europe/Lisbon" && p.kind === "in");
    const before = porto.find((p) => p.workDate === "2026-10-23")!;
    const after = porto.find((p) => p.workDate === "2026-10-26" && p.employeeKey === before.employeeKey);
    expect(DateTime.fromISO(before.atUtc).setZone("Europe/Lisbon").offset).toBe(60);
    if (after) expect(DateTime.fromISO(after.atUtc).setZone("Europe/Lisbon").offset).toBe(0);
  });
});
