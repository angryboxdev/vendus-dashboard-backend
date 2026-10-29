import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { AttendanceUseCases, type ConferenceInput } from "../../application/use-cases/attendance.use-cases.js";
import { AttendanceConflictError } from "../../domain/errors.js";
import type { DayPlan } from "../../domain/services/day-engine.js";
import { FakeAttendanceRepository, FakeAudit, FakeBackground, FakeClockNow, FakeContext } from "../fakes/fake-attendance.js";

const ORG = mintOrganizationId("org-a");
const BOSS = { userId: "u-boss", email: "gestora@demo.invalid" };
// Outubro (antes de 25/10) em Lisboa = UTC+1.
const at = (local: string) => new Date(`${local}+01:00`).toISOString();
const plan = (start: string, end: string, minutes = 480): DayPlan => ({ theoreticalMinutes: minutes, plannedStart: start, plannedEnd: end, nightSchedule: false, excused: false, plannedRanges: [{ start, end }] });
const all = async () => true;

function setup(now = at("2026-10-16T10:00:00")) {
  const repo = new FakeAttendanceRepository();
  const ctx = new FakeContext();
  const clock = new FakeClockNow(now);
  repo.now = () => clock.value;
  const audit = new FakeAudit();
  const closed = new Set<string>();
  const uc = new AttendanceUseCases(repo, ctx, audit, clock, new FakeBackground(), { closedDates: async () => closed });
  // 15:00–23:00 de segunda a sexta (12 a 16/10).
  ctx.plan = () => plan("15:00", "23:00");
  const punch = (employeeId: string, local: string, segmentType: "work" | "off" | "break_unpaid" = "work") =>
    repo.events.push({ id: `ev-${repo.events.length + 1}`, employeeId, occurredAt: at(local), segmentType, source: "web", clientEventId: null, locationId: null, latitude: null, longitude: null, ip: null });
  return { repo, ctx, clock, audit, closed, uc, punch };
}

const input = (over: Partial<ConferenceInput> = {}): ConferenceInput => ({
  decision: "fulfilled",
  scope: "day",
  items: [{ employeeId: "e1", workDate: "2026-10-12", version: null }],
  reason: "Erro de picagem confirmado pelo gestor",
  declared: true,
  manual: null,
  absenceType: null,
  ...over,
});

describe("Conferência V2 (ADR-0043)", () => {
  test("6) entrada 15:21 num turno 15:00–23:00 já terminado: cumpriu valida 8h e a picagem original fica", async () => {
    const { uc, repo, punch } = setup();
    punch("e1", "2026-10-12T15:21:00");
    punch("e1", "2026-10-12T23:00:00", "off");
    await uc.recalculate(ORG, "e1", "2026-10-12", "2026-10-12", "inicial");
    expect(repo.incidents.map((i) => [i.type, i.status])).toEqual([["late", "open"]]);

    const r = await uc.applyConference(ORG, BOSS, input(), all);
    expect(r.applied).toMatchObject([{ employeeId: "e1", workDate: "2026-10-12", beforeSeconds: 459 * 60, validatedSeconds: 480 * 60 }]);
    // Picagem intocada; o dia passa a 8h com versão nova, movimento de ajuste e o incidente resolvido na conferência.
    expect(repo.events[0]!.occurredAt).toBe(at("2026-10-12T15:21:00"));
    const days = await uc.days(ORG, "e1", "2026-10-12", "2026-10-12");
    expect(days.days[0]).toMatchObject({ workedSeconds: 480 * 60, excessSeconds: 0, incidents: [] });
    expect(repo.days.filter((d) => d.workDate === "2026-10-12").map((d) => [d.version, d.workedSeconds])).toEqual([
      [1, 459 * 60],
      [2, 480 * 60],
    ]);
    expect(repo.adjustments).toMatchObject([{ deltaExcessSeconds: 21 * 60, reason: "Conferência: Erro de picagem confirmado pelo gestor" }]);
    expect(repo.incidents[0]).toMatchObject({ status: "resolved_correct", comment: "Resolvido na conferência." });
  });

  test("cumpriu sem a declaração do gestor é recusado e nada é gravado", async () => {
    const { uc, repo, punch } = setup();
    punch("e1", "2026-10-12T15:21:00");
    punch("e1", "2026-10-12T23:00:00", "off");
    await expect(uc.applyConference(ORG, BOSS, input({ declared: false }), all)).rejects.toMatchObject({ field: "declared" });
    expect(repo.reviews).toEqual([]);
  });

  test("7) turno ainda em curso: não se confirma antes do fim", async () => {
    const { uc, punch } = setup(at("2026-10-16T18:00:00"));
    punch("e1", "2026-10-16T15:21:00");
    const r = await uc.applyConference(ORG, BOSS, input({ items: [{ employeeId: "e1", workDate: "2026-10-16", version: null }] }), all);
    expect(r.skipped).toMatchObject([{ reason: "in_progress", label: "Turno ainda em curso" }]);
  });

  test("8) atraso real: manter fica revisto sem mudar horas", async () => {
    const { uc, punch } = setup();
    punch("e1", "2026-10-12T15:21:00");
    punch("e1", "2026-10-12T23:00:00", "off");
    await uc.applyConference(ORG, BOSS, input({ decision: "keep", declared: false }), all);
    const d = (await uc.days(ORG, "e1", "2026-10-12", "2026-10-12")).days[0]!;
    expect(d).toMatchObject({ workedSeconds: 459 * 60, incidents: [] });
  });

  test("20) lote misto: aplica os aptos, revê os conformes e devolve os outros com o motivo", async () => {
    const { uc, repo, punch } = setup();
    punch("e1", "2026-10-12T15:21:00"); // atraso → apto
    punch("e1", "2026-10-12T23:00:00", "off");
    punch("e1", "2026-10-13T15:00:00"); // conforme → fica revisto
    punch("e1", "2026-10-13T23:00:00", "off");
    // 14/10 sem picagens → revisão individual (9)
    punch("e1", "2026-10-15T10:00:00"); // 13h → horas extra preservadas (10)
    punch("e1", "2026-10-15T23:00:00", "off");
    const items = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"].map((workDate) => ({ employeeId: "e1", workDate, version: null }));
    const r = await uc.applyConference(ORG, BOSS, input({ scope: "week", items }), all);
    expect(r.applied.map((a) => a.workDate)).toEqual(["2026-10-12"]);
    expect(r.kept.map((a) => a.workDate)).toEqual(["2026-10-13"]);
    expect(r.skipped.map((s) => [s.workDate, s.reason])).toEqual([
      ["2026-10-14", "no_punches"],
      ["2026-10-15", "overtime"],
    ]);
    expect(repo.reviews.map((x) => [x.workDate, x.decision, x.batchId === r.batchId])).toEqual([
      ["2026-10-12", "fulfilled", true],
      ["2026-10-13", "keep", true],
    ]);
    const d15 = (await uc.days(ORG, "e1", "2026-10-15", "2026-10-15")).days[0]!;
    expect(d15.workedSeconds).toBe(13 * 3600);
  });

  test("9) num só dia, sem picagens: cumpriu (com declaração) valida o planeado", async () => {
    const { uc } = setup();
    const r = await uc.applyConference(ORG, BOSS, input({ items: [{ employeeId: "e1", workDate: "2026-10-14", version: null }] }), all);
    expect(r.applied).toMatchObject([{ validatedSeconds: 480 * 60 }]);
  });

  test("17) concorrência: a segunda decisão no mesmo dia salta; versão desatualizada também", async () => {
    const { uc, punch } = setup();
    punch("e1", "2026-10-12T15:21:00");
    punch("e1", "2026-10-12T23:00:00", "off");
    await uc.applyConference(ORG, BOSS, input(), all);
    const again = await uc.applyConference(ORG, BOSS, input(), all);
    expect(again.skipped).toMatchObject([{ reason: "already_reviewed" }]);
    const stale = await uc.applyConference(ORG, BOSS, input({ items: [{ employeeId: "e1", workDate: "2026-10-13", version: 7 }] }), all);
    expect(stale.skipped).toMatchObject([{ reason: "changed" }]);
  });

  test("período fechado, o próprio registo e fora do âmbito não mudam", async () => {
    const { uc, closed, punch } = setup();
    punch("e1", "2026-10-12T15:21:00");
    punch("e1", "2026-10-12T23:00:00", "off");
    closed.add("2026-10-12");
    expect((await uc.applyConference(ORG, BOSS, input(), all)).skipped).toMatchObject([{ reason: "closed" }]);
    const self = await uc.applyConference(ORG, BOSS, input({ items: [{ employeeId: "e9", workDate: "2026-10-13", version: null }] }), all);
    expect(self.skipped).toMatchObject([{ reason: "self" }]);
    const hidden = await uc.applyConference(ORG, BOSS, input({ items: [{ employeeId: "e2", workDate: "2026-10-13", version: null }] }), async () => false);
    expect(hidden.skipped).toMatchObject([{ reason: "out_of_scope" }]);
  });

  test("14) trabalho sem escala: exceção de planeamento antes de qualquer cumprimento", async () => {
    const { uc, ctx, punch } = setup();
    ctx.plan = () => ({ theoreticalMinutes: 0, plannedStart: null, plannedEnd: null, nightSchedule: false, excused: false });
    punch("e1", "2026-10-12T12:00:00");
    punch("e1", "2026-10-12T17:40:00", "off");
    expect((await uc.applyConference(ORG, BOSS, input(), all)).skipped).toMatchObject([{ reason: "schedule_exception" }]);
  });

  test("correção manual: entrada/saída/pausa de um só dia, sem mexer nas picagens", async () => {
    const { uc, repo, punch } = setup();
    punch("e1", "2026-10-12T15:21:00");
    punch("e1", "2026-10-12T23:00:00", "off");
    const r = await uc.applyConference(ORG, BOSS, input({ decision: "manual", declared: false, manual: { start: "15:10", end: "23:00", breakMinutes: 30 } }), all);
    expect(r.applied).toMatchObject([{ validatedSeconds: 440 * 60 }]);
    expect(repo.reviews[0]!.manual).toEqual({ start: "15:10", end: "23:00", breakMinutes: 30 });
    await expect(uc.applyConference(ORG, BOSS, input({ decision: "manual", manual: { start: "9h", end: "18:00", breakMinutes: 0 } }), all)).rejects.toMatchObject({ field: "manual" });
  });

  test("anular uma decisão devolve o dia ao calculado e permite rever de novo", async () => {
    const { uc, repo, punch, audit } = setup();
    punch("e1", "2026-10-12T15:21:00");
    punch("e1", "2026-10-12T23:00:00", "off");
    const r = await uc.applyConference(ORG, BOSS, input(), all);
    await uc.voidConferenceReview(ORG, BOSS, r.applied[0]!.reviewId, "Decisão errada", all);
    expect((await uc.days(ORG, "e1", "2026-10-12", "2026-10-12")).days[0]!.workedSeconds).toBe(459 * 60);
    await expect(uc.voidConferenceReview(ORG, BOSS, r.applied[0]!.reviewId, "outra vez", all)).rejects.toBeInstanceOf(AttendanceConflictError);
    expect((await uc.applyConference(ORG, BOSS, input({ decision: "keep" }), all)).applied).toHaveLength(1);
    expect(repo.reviews.filter((x) => !x.voidedAt)).toHaveLength(1);
    expect(audit.entries.map((e) => e.action)).toEqual(["attendance.conference.apply", "attendance.conference.void", "attendance.conference.apply"]);
  });

  test("semana da equipa: estado, picagens (pausa e noturno) e decisão por dia, só quem é visível", async () => {
    const { uc, ctx, punch } = setup();
    ctx.plan = (d) => (d === "2026-10-13" ? { ...plan("22:00", "04:00", 360), nightSchedule: true } : plan("15:00", "23:00"));
    punch("e1", "2026-10-12T15:00:00");
    punch("e1", "2026-10-12T19:00:00", "break_unpaid");
    punch("e1", "2026-10-12T19:30:00");
    punch("e1", "2026-10-12T23:30:00", "off");
    punch("e1", "2026-10-13T21:58:00");
    punch("e1", "2026-10-14T04:02:00", "off");
    const w = await uc.conferenceWeek(ORG, "2026-10-12", "2026-10-13", async (id) => id === "e1");
    expect(w.people.map((p) => p.name)).toEqual(["Ana Teste"]);
    const [d12, d13] = w.days;
    expect(d12!.punches.map((p) => `${p.kind} ${p.at}`)).toEqual(["in 15:00", "break_start 19:00", "break_end 19:30", "out 23:30"]);
    expect(d12!.state).toBe("ok");
    expect(d13!.punches.map((p) => `${p.kind} ${p.at}${p.nextDay ? "+1" : ""}`)).toEqual(["in 21:58", "out 04:02+1"]);
    expect(d13).toMatchObject({ plannedRanges: [{ start: "22:00", end: "04:00" }], phase: "done" });
  });
});
