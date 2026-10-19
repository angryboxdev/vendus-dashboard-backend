import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CoverageUseCases } from "../../application/use-cases/coverage.use-cases.js";
import { RostersUseCases } from "../../application/use-cases/rosters.use-cases.js";
import type { ShiftState } from "../../domain/entities/roster.js";
import { RosterConflictError, RosterValidationError } from "../../domain/errors.js";
import { coverageDay, isoWeekday, rulesForDay, validateCoverageRule, type CoverageRule } from "../../domain/services/coverage.js";
import { FakeCoverageContext, FakeCoverageRules, FakePublishedHook, FakeRostersAudit, FakeRostersContext, FakeRostersNotifier, FakeRostersRepository } from "../fakes/fake-rosters.js";

/** Plano de Cobertura: mínimos por centro/área e intervalo, planeado vs. publicado. Dados fictícios. */
const ORG = mintOrganizationId("org-a");
const BOSS = { userId: "u-boss", email: "gestora@demo.invalid" };
const PORTO = "11111111-1111-4111-8111-111111111111";
const BRAGA = "22222222-2222-4222-8222-222222222222";
// 2026-11-02 é uma segunda-feira.
const MON = "2026-11-02";
const TUE = "2026-11-03";

const rule = (p: Partial<CoverageRule>): CoverageRule => ({ id: "r", locationId: PORTO, areaId: null, weekday: 1, date: null, start: "09:00", end: "17:00", minPeople: 2, ...p });
const st = (employeeId: string, workDate: string, start: string, end: string, extra: Partial<ShiftState> = {}): ShiftState => ({
  employeeId,
  workDate,
  kind: "shift",
  segments: [{ start, end }],
  templateId: null,
  onCall: false,
  areaId: null,
  ...extra,
});
const none = () => false;

describe("Cobertura — regras", () => {
  test("validação: dia da semana OU data, intervalo válido (pode passar a meia-noite), mínimo inteiro 0–500", () => {
    expect(() => validateCoverageRule(rule({}))).not.toThrow();
    expect(() => validateCoverageRule(rule({ start: "22:00", end: "06:00" }))).not.toThrow();
    expect(() => validateCoverageRule(rule({ weekday: null, date: MON }))).not.toThrow();
    expect(() => validateCoverageRule(rule({ date: MON }))).toThrow(RosterValidationError);
    expect(() => validateCoverageRule(rule({ weekday: null }))).toThrow(RosterValidationError);
    expect(() => validateCoverageRule(rule({ weekday: 8 }))).toThrow(RosterValidationError);
    expect(() => validateCoverageRule(rule({ start: "10:00", end: "10:00" }))).toThrow(RosterValidationError);
    expect(() => validateCoverageRule(rule({ minPeople: 1.5 }))).toThrow(RosterValidationError);
    expect(() => validateCoverageRule(rule({ minPeople: -1 }))).toThrow(RosterValidationError);
  });

  test("exceção datada substitui as regras semanais desse dia (do mesmo âmbito)", () => {
    expect(isoWeekday(MON)).toBe(1);
    expect(isoWeekday("2026-11-08")).toBe(7);
    const rules = [rule({ id: "w" }), rule({ id: "x", weekday: null, date: MON, minPeople: 5 }), rule({ id: "a", areaId: "sala" })];
    expect(rulesForDay(rules, MON, null).map((r) => r.id)).toEqual(["x"]);
    expect(rulesForDay(rules, "2026-11-09", null).map((r) => r.id)).toEqual(["w"]);
    expect(rulesForDay(rules, MON, "sala").map((r) => r.id)).toEqual(["a"]);
    expect(rulesForDay(rules, TUE, null)).toEqual([]);
  });
});

describe("Cobertura — cálculo", () => {
  test("sem regra: «Não configurado» (nunca défice)", () => {
    const d = coverageDay({ date: TUE, areaId: null, rules: [rule({})], planned: [], published: [], absent: none });
    expect(d).toEqual({ date: TUE, areaId: null, status: "not_configured", windows: [] });
  });

  test("intervalos partidos onde muda a lotação; cada pessoa conta uma vez (turno repartido não duplica)", () => {
    const split = { ...st("e2", MON, "09:00", "12:00"), segments: [{ start: "09:00", end: "12:00" }, { start: "12:00", end: "17:00" }] };
    const d = coverageDay({ date: MON, areaId: null, rules: [rule({})], planned: [st("e1", MON, "08:00", "13:00"), split], published: [], absent: none });
    expect(d.status).toBe("deficit");
    expect(d.windows.map((w) => [w.start, w.end, w.required, w.planned])).toEqual([
      ["09:00", "13:00", 2, 2],
      ["13:00", "17:00", 2, 1],
    ]);
  });

  test("regras sobrepostas não se somam: vale o maior mínimo", () => {
    const rules = [rule({ id: "a", start: "09:00", end: "17:00", minPeople: 2 }), rule({ id: "b", start: "12:00", end: "15:00", minPeople: 3 })];
    const ppl = [st("e1", MON, "09:00", "17:00"), st("e2", MON, "09:00", "17:00"), st("e3", MON, "12:00", "15:00")];
    const d = coverageDay({ date: MON, areaId: null, rules, planned: ppl, published: [], absent: none });
    expect(d.status).toBe("ok");
    expect(d.windows.map((w) => [w.start, w.end, w.required, w.planned])).toEqual([
      ["09:00", "12:00", 2, 2],
      ["12:00", "15:00", 3, 3],
      ["15:00", "17:00", 2, 2],
    ]);
  });

  test("passa a meia-noite: turno noturno da véspera e madrugada contam; folgas e ausências não", () => {
    const rules = [rule({ start: "22:00", end: "02:00", minPeople: 1 })];
    const off: ShiftState = { ...st("e3", MON, "22:00", "02:00"), kind: "day_off", segments: [] };
    const d = coverageDay({ date: MON, areaId: null, rules, planned: [st("e1", MON, "23:00", "03:00"), off, st("e4", MON, "22:00", "02:00")], published: [], absent: (e) => e === "e4" });
    expect(d.windows.map((w) => [w.start, w.end, w.startsNextDay, w.endsNextDay, w.planned])).toEqual([
      ["22:00", "23:00", false, false, 0],
      ["23:00", "02:00", false, true, 1],
    ]);
    expect(d.status).toBe("deficit");
  });

  test("planeado (rascunho) vs. publicado lado a lado", () => {
    const d = coverageDay({ date: MON, areaId: null, rules: [rule({ minPeople: 1 })], planned: [st("e1", MON, "09:00", "17:00")], published: [], absent: none });
    expect(d.windows).toEqual([{ start: "09:00", end: "17:00", startsNextDay: false, endsNextDay: false, required: 1, planned: 1, published: 0 }]);
    expect(d.status).toBe("ok");
  });
});

describe("Cobertura — casos de uso", () => {
  function setup() {
    const repo = new FakeRostersRepository();
    const rules = new FakeCoverageRules();
    const ctx = new FakeCoverageContext();
    const audit = new FakeRostersAudit();
    const rosters = new RostersUseCases(repo, new FakeRostersContext(), new FakeRostersNotifier(), new FakePublishedHook(), audit);
    const cov = new CoverageUseCases(rules, repo, ctx, audit);
    return { repo, rules, ctx, audit, rosters, cov };
  }

  test("desligado por omissão na empresa: não se gravam regras e a escala não mostra cobertura", async () => {
    const { ctx, cov, rosters } = setup();
    ctx.on = false;
    const roster = await rosters.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    expect(await cov.status(ORG)).toEqual({ enabled: false });
    await expect(cov.createRule(ORG, BOSS, rule({}))).rejects.toBeInstanceOf(RosterConflictError);
    expect(await cov.coverage(ORG, roster.id, MON, TUE)).toEqual({ enabled: false, locationId: null, days: [] });
  });

  test("regras: área do centro, sem duplicados, alterar o mínimo e apagar (com auditoria)", async () => {
    const { cov, rosters, audit } = setup();
    const sala = await rosters.createArea(ORG, BOSS, { locationId: PORTO, name: "Sala" });
    const bar = await rosters.createArea(ORG, BOSS, { locationId: BRAGA, name: "Bar" });
    const r = await cov.createRule(ORG, BOSS, { locationId: PORTO, areaId: sala.id, weekday: 1, date: null, start: "12:00", end: "15:00", minPeople: 3 });
    await expect(cov.createRule(ORG, BOSS, { locationId: PORTO, areaId: bar.id, weekday: 1, date: null, start: "12:00", end: "15:00", minPeople: 1 })).rejects.toMatchObject({ field: "areaId" });
    await expect(cov.createRule(ORG, BOSS, { locationId: PORTO, areaId: sala.id, weekday: 1, date: null, start: "12:00", end: "15:00", minPeople: 1 })).rejects.toBeInstanceOf(RosterConflictError);
    expect((await cov.updateRule(ORG, BOSS, r.id, { minPeople: 4 })).minPeople).toBe(4);
    await cov.deleteRule(ORG, BOSS, r.id);
    expect(await cov.listRules(ORG, PORTO)).toEqual([]);
    expect(audit.actions.filter((a) => a.action.startsWith("rosters.coverage.")).map((a) => a.action)).toEqual(["rosters.coverage.create", "rosters.coverage.update", "rosters.coverage.delete"]);
  });

  test("escala do centro: centro inteiro e áreas; turnos de escalas de grupo só contam com área do centro; ausências fora", async () => {
    const { cov, rosters, ctx } = setup();
    const roster = await rosters.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    const group = await rosters.createRoster(ORG, BOSS, { name: "Equipa volante", targetType: "group", targetId: "g1" });
    const sala = await rosters.createArea(ORG, BOSS, { locationId: PORTO, name: "Sala" });
    await cov.createRule(ORG, BOSS, { locationId: PORTO, areaId: null, weekday: 1, date: null, start: "09:00", end: "17:00", minPeople: 3 });
    await cov.createRule(ORG, BOSS, { locationId: PORTO, areaId: sala.id, weekday: 1, date: null, start: "09:00", end: "17:00", minPeople: 2 });
    const seg = [{ start: "09:00", end: "17:00" }];
    await rosters.addShift(ORG, BOSS, roster.id, { employeeId: "e1", workDate: MON, kind: "shift", templateId: null, segments: seg, areaId: sala.id });
    await rosters.addShift(ORG, BOSS, roster.id, { employeeId: "e2", workDate: MON, kind: "shift", templateId: null, segments: seg });
    await rosters.addShift(ORG, BOSS, group.id, { employeeId: "e3", workDate: MON, kind: "shift", templateId: null, segments: seg, areaId: sala.id });
    // Volante sem área: não se sabe o centro — não conta.
    await rosters.addShift(ORG, BOSS, group.id, { employeeId: "e4", workDate: MON, kind: "shift", templateId: null, segments: seg });
    // Ausência aprovada: não conta.
    await rosters.addShift(ORG, BOSS, roster.id, { employeeId: "e5", workDate: MON, kind: "shift", templateId: null, segments: seg });
    ctx.absences.set("e5", [MON]);
    const report = await cov.coverage(ORG, roster.id, MON, TUE);
    expect(report.enabled).toBe(true);
    expect(report.locationId).toBe(PORTO);
    const day = (d: string, a: string | null) => report.days.find((x) => x.date === d && x.areaId === a)!;
    expect(day(MON, null)).toMatchObject({ status: "ok", windows: [expect.objectContaining({ required: 3, planned: 3, published: 0 })] });
    expect(day(MON, sala.id)).toMatchObject({ status: "ok", windows: [expect.objectContaining({ required: 2, planned: 2 })] });
    expect(day(TUE, null).status).toBe("not_configured");
    // Depois de publicar, o publicado acompanha o planeado.
    await rosters.publish(ORG, BOSS, roster.id, { reason: null, confirm: true });
    const after = await cov.coverage(ORG, roster.id, MON, MON);
    expect(after.days.find((x) => x.areaId === null)!.windows[0]).toMatchObject({ planned: 3, published: 2 });
  });

  test("escala de grupo: sem cobertura (é por centro); período inválido recusado", async () => {
    const { cov, rosters } = setup();
    const group = await rosters.createRoster(ORG, BOSS, { name: "Equipa volante", targetType: "group", targetId: "g1" });
    expect(await cov.coverage(ORG, group.id, MON, TUE)).toEqual({ enabled: true, locationId: null, days: [] });
    await expect(cov.coverage(ORG, group.id, TUE, MON)).rejects.toBeInstanceOf(RosterValidationError);
  });
});
