import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { RostersUseCases } from "../../application/use-cases/rosters.use-cases.js";
import { segmentRanges, validateSegments } from "../../domain/entities/roster.js";
import { RosterBlockedError, RosterValidationError } from "../../domain/errors.js";
import { evaluate, findOverlap } from "../../domain/services/constraints.js";
import { FakePublishedHook, FakeRostersAudit, FakeRostersContext, FakeRostersNotifier, FakeRostersRepository, NO_RULES } from "../fakes/fake-rosters.js";

/** Seletor inteligente e prevenção de sobreposições (task «Seletor e sobreposição»). Dados fictícios. */
const ORG = mintOrganizationId("org-a");
const BOSS = { userId: "u-boss", email: "gestora@demo.invalid" };
const PORTO = "11111111-1111-4111-8111-111111111111";
const BRAGA = "22222222-2222-4222-8222-222222222222";

function setup() {
  const repo = new FakeRostersRepository();
  const ctx = new FakeRostersContext();
  const uc = new RostersUseCases(repo, ctx, new FakeRostersNotifier(), new FakePublishedHook(), new FakeRostersAudit());
  return { repo, ctx, uc };
}
const free = (employeeId: string, workDate: string, ...segs: [string, string][]) => ({ employeeId, workDate, kind: "shift" as const, templateId: null, segments: segs.map(([start, end]) => ({ start, end })) });
const st = (workDate: string, ...segs: [string, string][]) => ({ ...free("e1", workDate, ...segs), onCall: false });

describe("Sobreposição — domínio", () => {
  test("turno repartido: a faixa depois da meia-noite é madrugada do dia seguinte; faixas não se sobrepõem", () => {
    expect(segmentRanges([{ start: "18:00", end: "23:00" }, { start: "00:30", end: "02:00" }])).toEqual([{ start: 1080, end: 1380 }, { start: 1470, end: 1560 }]);
    expect(() => validateSegments([{ start: "09:00", end: "13:00" }, { start: "12:00", end: "16:00" }])).toThrow(RosterValidationError);
    expect(() => validateSegments([{ start: "09:00", end: "13:00" }, { start: "13:00", end: "17:00" }])).not.toThrow();
  });

  test("noturno de segunda (22–06) sobrepõe terça 05–12 entre 05:00 e 06:00; o intervalo livre de um repartido não bloqueia", () => {
    expect(findOverlap(st("2026-10-27", ["05:00", "12:00"]), [st("2026-10-26", ["22:00", "06:00"])])).toMatchObject({ from: "05:00", to: "06:00" });
    // Repartido 09–13 + 17–21: um turno 14–16 cabe no intervalo.
    expect(findOverlap(st("2026-10-26", ["14:00", "16:00"]), [st("2026-10-26", ["09:00", "13:00"], ["17:00", "21:00"])])).toBeNull();
    // Encostados não se sobrepõem.
    expect(findOverlap(st("2026-10-26", ["13:00", "19:00"]), [st("2026-10-26", ["09:00", "13:00"])])).toBeNull();
  });

  test("deteta sobreposição escondida atrás de um turno curto (08–20, 09–10, 11–12) e identifica o turno incompatível", () => {
    const v = evaluate(
      [
        { ...st("2026-10-26", ["08:00", "20:00"]), id: "a", rosterId: "r1", published: true },
        { ...st("2026-10-26", ["09:00", "10:00"]), id: "b", rosterId: "r1" },
        { ...st("2026-10-26", ["11:00", "12:00"]), id: "c", rosterId: "r2" },
      ],
      NO_RULES,
      new Map(),
    );
    expect(v).toHaveLength(1); // uma violação por regra/colaborador/dia
    expect(v[0]).toMatchObject({ rule: "overlap", shiftId: "b", conflict: { shiftId: "a", rosterId: "r1", hours: "08:00–20:00", published: true }, overlap: "09:00–10:00" });
    const onlyC = evaluate([{ ...st("2026-10-26", ["08:00", "20:00"]), id: "a" }, { ...st("2026-10-27", ["09:00", "10:00"]), id: "b" }, { ...st("2026-10-26", ["11:00", "12:00"]), id: "c" }], NO_RULES, new Map());
    expect(onlyC[0]).toMatchObject({ shiftId: "c", conflict: { shiftId: "a" }, overlap: "11:00–12:00" });
  });

  test("regras por colaborador (antes valiam as do primeiro para todos)", () => {
    const rules = (e: string) => (e === "e1" ? { ...NO_RULES, maxDailyMinutes: 300 } : NO_RULES);
    const v = evaluate([st("2026-10-26", ["08:00", "16:00"]), { ...st("2026-10-26", ["08:00", "16:00"]), employeeId: "e2" }], rules, new Map());
    expect(v.map((x) => [x.rule, x.employeeId])).toEqual([["max_daily", "e1"]]);
  });
});

describe("Sobreposição — casos de uso (todos os centros)", () => {
  test("Porto 09–17 e Braga 14–22 no mesmo dia: bloqueia antes de gravar, com o turno e o troço em conflito; 09–13 + 14–19 passa", async () => {
    const { uc, repo } = setup();
    const porto = await uc.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    const braga = await uc.createRoster(ORG, BOSS, { name: "Centro Braga", targetType: "location", targetId: BRAGA });
    const a = await uc.addShift(ORG, BOSS, porto.id, free("e1", "2026-10-26", ["09:00", "17:00"]));
    const before = repo.shifts.length;
    const err = await uc.addShift(ORG, BOSS, braga.id, free("e1", "2026-10-26", ["14:00", "22:00"])).catch((e) => e);
    expect(err).toBeInstanceOf(RosterBlockedError);
    expect(err.violations[0]).toMatchObject({
      rule: "overlap",
      rosterId: braga.id,
      conflict: { shiftId: a.shift.id, rosterId: porto.id, rosterName: "Centro Porto", hours: "09:00–17:00", published: false },
      overlap: "14:00–17:00",
    });
    expect(err.violations[0].message).toContain("Sobreposição entre 14:00 e 17:00");
    expect(repo.shifts.length).toBe(before); // nada gravado

    await uc.addShift(ORG, BOSS, porto.id, free("e2", "2026-10-26", ["09:00", "13:00"]));
    await expect(uc.addShift(ORG, BOSS, braga.id, free("e2", "2026-10-26", ["14:00", "19:00"]))).resolves.toBeTruthy();
  });

  test("editar um turno não o compara consigo próprio; mudar de colaborador valida o novo", async () => {
    const { uc } = setup();
    const r = await uc.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    const a = await uc.addShift(ORG, BOSS, r.id, free("e1", "2026-10-26", ["09:00", "17:00"]));
    await expect(uc.updateShift(ORG, BOSS, a.shift.id, { segments: [{ start: "10:00", end: "18:00" }] }, { reason: null, confirm: false })).resolves.toBeTruthy();
    await uc.addShift(ORG, BOSS, r.id, free("e2", "2026-10-26", ["12:00", "20:00"]));
    await expect(uc.updateShift(ORG, BOSS, a.shift.id, { employeeId: "e2" }, { reason: null, confirm: false })).rejects.toBeInstanceOf(RosterBlockedError);
  });

  test("repetir a mesma atribuição em massa não duplica: turnos recusam, folgas não se repetem", async () => {
    const { uc, repo } = setup();
    const r = await uc.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    const t = await uc.createTemplate(ORG, BOSS, { name: "Manhã", abbreviation: "M", color: null, onCall: false, segments: [{ start: "08:00", end: "16:00" }] });
    const input = { employeeIds: ["e1"], from: "2026-10-26", to: "2026-10-28", weekdays: [], kind: "shift" as const, templateId: t.id };
    await uc.assignBulk(ORG, BOSS, r.id, input);
    await expect(uc.assignBulk(ORG, BOSS, r.id, input)).rejects.toBeInstanceOf(RosterBlockedError);
    expect(repo.shifts.filter((s) => !s.deleted)).toHaveLength(3);
    const off = { employeeIds: ["e2"], from: "2026-10-26", to: "2026-10-27", weekdays: [], kind: "day_off" as const, templateId: null };
    await uc.assignBulk(ORG, BOSS, r.id, off);
    expect((await uc.assignBulk(ORG, BOSS, r.id, off)).created).toBe(0);
    const again = await uc.addShift(ORG, BOSS, r.id, { employeeId: "e2", workDate: "2026-10-26", kind: "day_off", templateId: null, segments: [] });
    expect(repo.shifts.filter((s) => !s.deleted && s.employeeId === "e2")).toHaveLength(2);
    expect(again.shift.kind).toBe("day_off");
  });

  test("dois gestores em simultâneo: o segundo pedido que grava por cima é desfeito e recusado", async () => {
    const { uc, repo } = setup();
    const porto = await uc.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    const braga = await uc.createRoster(ORG, BOSS, { name: "Centro Braga", targetType: "location", targetId: BRAGA });
    // Simula a corrida: entre a verificação e a gravação, outro gestor grava 14–22 em Braga.
    const insert = repo.insertShifts.bind(repo);
    let raced = false;
    repo.insertShifts = async (o, rows, by) => {
      if (!raced) {
        raced = true;
        await insert(o, [{ ...free("e1", "2026-10-26", ["14:00", "22:00"]), onCall: false, rosterId: braga.id }], "outro@demo.invalid");
      }
      return insert(o, rows, by);
    };
    await expect(uc.addShift(ORG, BOSS, porto.id, free("e1", "2026-10-26", ["09:00", "17:00"]))).rejects.toBeInstanceOf(RosterBlockedError);
    expect(repo.shifts.filter((s) => !s.deleted).map((s) => s.rosterId)).toEqual([braga.id]);
  });

  test("publicar só a semana visível: problemas de outra semana não bloqueiam e ficam por publicar", async () => {
    const { uc, ctx } = setup();
    ctx.rules_ = { ...NO_RULES, maxDailyMinutes: 300, limitsSeverity: "block" };
    const r = await uc.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    await uc.addShift(ORG, BOSS, r.id, free("e1", "2026-10-20", ["09:00", "13:00"]));
    await uc.addShift(ORG, BOSS, r.id, free("e1", "2026-10-27", ["08:00", "18:00"])); // excede o diário (semana seguinte)
    await expect(uc.publish(ORG, BOSS, r.id, { reason: null, confirm: false })).rejects.toBeInstanceOf(RosterBlockedError);
    const week = await uc.check(ORG, r.id, { from: "2026-10-19", to: "2026-10-25" });
    expect(week).toEqual({ pending: 1, violations: [] });
    const pub = await uc.publish(ORG, BOSS, r.id, { reason: null, confirm: false, from: "2026-10-19", to: "2026-10-25" });
    expect(pub.changes).toHaveLength(1);
    expect((await uc.check(ORG, r.id)).pending).toBe(1);
  });

  test("seletor: pertenças ao centro e turnos noutras escalas na semana (com horário); a própria escala não conta", async () => {
    const { uc, ctx } = setup();
    const porto = await uc.createRoster(ORG, BOSS, { name: "Centro Porto", targetType: "location", targetId: PORTO });
    const braga = await uc.createRoster(ORG, BOSS, { name: "Centro Braga", targetType: "location", targetId: BRAGA });
    ctx.members.set(`location:${PORTO}`, ["e1", "e2"]);
    await uc.addShift(ORG, BOSS, braga.id, free("e3", "2026-10-26", ["09:00", "13:00"]));
    await uc.addShift(ORG, BOSS, porto.id, free("e1", "2026-10-26", ["09:00", "13:00"]));
    await uc.addShift(ORG, BOSS, braga.id, free("e3", "2026-11-09", ["09:00", "13:00"])); // fora da semana
    const c = await uc.candidates(ORG, porto.id, "2026-10-26", "2026-11-01");
    expect(c.members).toEqual(["e1", "e2"]);
    expect(c.busy).toEqual([expect.objectContaining({ employeeId: "e3", rosterId: braga.id, rosterName: "Centro Braga", workDate: "2026-10-26", hours: "09:00–13:00", published: false })]);
  });
});
