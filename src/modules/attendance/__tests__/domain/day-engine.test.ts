import { effectiveEvents, type ClockEvent, type ClockRevision } from "../../domain/entities/clock.js";
import { computeDays, dayBoard, formatWorked, type DayPlan, type EngineRules } from "../../domain/services/day-engine.js";
import { checkPunch, distanceMeters, type PunchPolicy } from "../../domain/services/punch-policy.js";

const TZ = "Europe/Lisbon";
const RULES: EngineRules = {
  timeZone: TZ,
  nightRule: "night_schedule_only",
  continuityMinutes: null,
  toleranceMinutes: 0,
  roundingMinutes: 0,
  autoClose: false,
  maxOpenHours: 16,
  incidentHoursCount: false,
  nightStart: null,
  nightEnd: null,
};
const PLAN: DayPlan = { theoreticalMinutes: 480, plannedStart: null, plannedEnd: null, nightSchedule: false, excused: false };
const plans = (entries: [string, Partial<DayPlan>][]) => new Map(entries.map(([d, p]) => [d, { ...PLAN, ...p }]));

let n = 0;
const ev = (localIso: string, segmentType: ClockEvent["segmentType"], tz = TZ): ClockEvent => {
  // hora local → UTC (outubro em Lisboa = UTC+1 até 25/10)
  const utc = new Date(new Date(`${localIso}+01:00`).getTime()).toISOString();
  void tz;
  return { id: `e${++n}`, employeeId: "e1", occurredAt: utc, segmentType, source: "web", clientEventId: null, locationId: null, latitude: null, longitude: null, ip: null };
};
const eff = (events: ClockEvent[], revisions: ClockRevision[] = []) => effectiveEvents(events, revisions);

describe("Motor de apuramento (Fase 4)", () => {
  test("RE_5_soma_de_segmentos_e_pausa_nao_remunerada_fora", () => {
    const events = [ev("2026-10-07T07:15:29", "work"), ev("2026-10-07T10:15:13", "break_unpaid"), ev("2026-10-07T11:15:24", "remote"), ev("2026-10-07T17:15:25", "off")];
    const [day] = computeDays(eff(events), ["2026-10-07"], plans([["2026-10-07", {}]]), RULES, "2026-10-08T12:00:00Z");
    expect(day!.workedSeconds).toBe(8 * 3600 + 59 * 60 + 45);
    expect(formatWorked(day!.workedSeconds)).toBe("8h 59min");
    expect(day!.breakSeconds).toBe(3600 + 11);
    expect(day!.excessSeconds).toBe(day!.workedSeconds - 480 * 60);
  });

  test("RE_6_meia_noite_sem_horario_noturno_divide_e_os_totais_sao_os_mesmos_em_qualquer_vista", () => {
    const events = [ev("2026-10-10T21:26:00", "work")];
    const now = "2026-10-11T00:00:00Z"; // domingo 01:00 em Lisboa; registo ainda aberto
    const both = computeDays(eff(events), ["2026-10-10", "2026-10-11"], plans([]), RULES, now);
    expect(both.map((d) => d.workedSeconds)).toEqual([2 * 3600 + 34 * 60, 3600]);
    // Pedir só um dos dias dá exatamente o mesmo valor (uma só fonte).
    expect(computeDays(eff(events), ["2026-10-10"], plans([]), RULES, now)[0]!.workedSeconds).toBe(2 * 3600 + 34 * 60);
    expect(computeDays(eff(events), ["2026-10-11"], plans([]), RULES, now)[0]!.workedSeconds).toBe(3600);
    expect(both.flatMap((d) => d.incidents)).toEqual([]);
  });

  test("RE_7_noturno_com_margem_de_continuidade", () => {
    const rules = { ...RULES, nightRule: "continuity_margin" as const, continuityMinutes: 120 };
    const events = [ev("2026-10-09T22:00:00", "work"), ev("2026-10-10T01:00:00", "off"), ev("2026-10-10T04:00:00", "work"), ev("2026-10-10T06:00:00", "off")];
    const days = computeDays(eff(events), ["2026-10-09", "2026-10-10"], plans([]), rules, "2026-10-12T12:00:00Z");
    expect(days.map((d) => d.workedSeconds)).toEqual([3 * 3600, 2 * 3600]);
    // Dentro da margem (pausa de 1 h) conta no dia de início.
    const close = [ev("2026-10-09T22:00:00", "work"), ev("2026-10-10T01:00:00", "off"), ev("2026-10-10T02:00:00", "work"), ev("2026-10-10T03:00:00", "off")];
    expect(computeDays(eff(close), ["2026-10-09", "2026-10-10"], plans([]), rules, "2026-10-12T12:00:00Z").map((d) => d.workedSeconds)).toEqual([4 * 3600, 0]);
  });

  test("RE_8_noturno_com_turno_22_06_conta_tudo_no_dia_de_inicio", () => {
    const events = [ev("2026-10-09T22:00:00", "work"), ev("2026-10-10T01:00:00", "off"), ev("2026-10-10T02:00:00", "work"), ev("2026-10-10T06:00:00", "off")];
    const p = plans([["2026-10-09", { plannedStart: "22:00", plannedEnd: "06:00", nightSchedule: true }], ["2026-10-10", { theoreticalMinutes: 0 }]]);
    const days = computeDays(eff(events), ["2026-10-09", "2026-10-10"], p, RULES, "2026-10-12T12:00:00Z");
    expect(days.map((d) => d.workedSeconds)).toEqual([7 * 3600, 0]);
  });

  test("RE_14_um_incidente_por_tipo_e_dia_mesmo_com_muitos_segmentos", () => {
    const events: ClockEvent[] = [];
    for (let h = 10; h < 20; h++) events.push(ev(`2026-10-04T${h}:00:00`, "work"), ev(`2026-10-04T${h}:30:00`, "break_unpaid"));
    events.push(ev("2026-10-04T20:30:00", "work")); // fica aberto (esquecido)
    const [day] = computeDays(eff(events), ["2026-10-04"], plans([["2026-10-04", { plannedStart: "09:00" }]]), RULES, "2026-10-12T12:00:00Z");
    expect(day!.incidents.sort()).toEqual(["late", "missing_out"]);
  });

  test("D8: horas de registo esquecido ficam pendentes; fecho automático no fim planeado", () => {
    const events = [ev("2026-10-05T09:00:00", "work")];
    const p = plans([["2026-10-05", { plannedStart: "09:00", plannedEnd: "17:00" }]]);
    const pending = computeDays(eff(events), ["2026-10-05"], p, { ...RULES, autoClose: true }, "2026-10-12T12:00:00Z")[0]!;
    expect(pending).toMatchObject({ workedSeconds: 0, pendingSeconds: 8 * 3600, incidents: ["auto_closed"] });
    const counted = computeDays(eff(events), ["2026-10-05"], p, { ...RULES, autoClose: true, incidentHoursCount: true }, "2026-10-12T12:00:00Z")[0]!;
    expect(counted.workedSeconds).toBe(8 * 3600);
  });

  test("D8: registo esquecido sem fecho automático fica pendente só no dia de início (não se arrasta)", () => {
    const events = [ev("2026-10-05T09:00:00", "work")];
    const days = computeDays(eff(events), ["2026-10-05", "2026-10-06"], plans([["2026-10-05", {}], ["2026-10-06", {}]]), RULES, "2026-10-12T12:00:00Z");
    expect(days[0]).toMatchObject({ workedSeconds: 0, pendingSeconds: 15 * 3600, incidents: ["missing_out"] });
    expect(days[1]).toMatchObject({ workedSeconds: 0, pendingSeconds: 0, incidents: ["missing_in"] });
    const validated = computeDays(eff(events), ["2026-10-05"], plans([["2026-10-05", { incidentValidated: true }]]), RULES, "2026-10-12T12:00:00Z")[0]!;
    expect(validated).toMatchObject({ workedSeconds: 15 * 3600, pendingSeconds: 0 });
  });

  test("CF_7_licenca_descontar_poe_teorico_a_0_e_contar_como_trabalhado_soma_8h", () => {
    const reduce = computeDays([], ["2026-10-06"], plans([["2026-10-06", { theoreticalMinutes: 0, excused: true }]]), RULES, "2026-10-12T12:00:00Z")[0]!;
    expect(reduce).toMatchObject({ theoreticalSeconds: 0, workedSeconds: 0, excessSeconds: 0, incidents: [] });
    const counted = computeDays([], ["2026-10-06"], plans([["2026-10-06", { excused: true, creditSeconds: 8 * 3600 }]]), RULES, "2026-10-12T12:00:00Z")[0]!;
    expect(counted).toMatchObject({ theoreticalSeconds: 8 * 3600, workedSeconds: 8 * 3600, excessSeconds: 0, incidents: [] });
  });

  test("falta sem marcações num dia com teórico; feriado/ausência não gera falta", () => {
    expect(computeDays([], ["2026-10-06"], plans([["2026-10-06", {}]]), RULES, "2026-10-12T12:00:00Z")[0]!.incidents).toEqual(["missing_in"]);
    expect(computeDays([], ["2026-10-06"], plans([["2026-10-06", { excused: true }]]), RULES, "2026-10-12T12:00:00Z")[0]!.incidents).toEqual([]);
  });

  test("noturno legal só é contado quando a janela está definida (D6)", () => {
    const events = [ev("2026-10-07T20:00:00", "work"), ev("2026-10-08T01:00:00", "off")];
    const p = plans([["2026-10-07", { nightSchedule: true, plannedStart: "20:00", plannedEnd: "01:00" }]]);
    expect(computeDays(eff(events), ["2026-10-07"], p, RULES, "2026-10-12T12:00:00Z")[0]!.nightSeconds).toBe(0);
    const withWindow = computeDays(eff(events), ["2026-10-07"], p, { ...RULES, nightStart: "22:00", nightEnd: "07:00" }, "2026-10-12T12:00:00Z")[0]!;
    expect(withWindow.nightSeconds).toBe(3 * 3600);
  });

  test("revisões: acrescentar, mudar e anular; recusada pelo colaborador não conta", () => {
    const a = ev("2026-10-07T09:00:00", "work");
    const b = ev("2026-10-07T18:00:00", "off");
    const rev = (r: Partial<ClockRevision>): ClockRevision => ({ id: `r${++n}`, employeeId: "e1", operation: "update", targetEventId: null, occurredAt: null, segmentType: null, reason: "x", author: "rh", state: "active", refusableUntil: null, anchorAt: "2026-10-07T08:00:00Z", createdAt: `2026-10-08T0${n % 9}:00:00Z`, ...r });
    const moved = eff([a, b], [rev({ operation: "update", targetEventId: b.id, occurredAt: new Date("2026-10-07T17:00:00+01:00").toISOString() })]);
    expect(computeDays(moved, ["2026-10-07"], plans([]), RULES, "2026-10-12T12:00:00Z")[0]!.workedSeconds).toBe(8 * 3600);
    const refused = eff([a, b], [rev({ operation: "void", targetEventId: b.id, state: "refused" })]);
    expect(refused).toHaveLength(2);
    const added = eff([a], [rev({ operation: "add", occurredAt: new Date("2026-10-07T13:00:00+01:00").toISOString(), segmentType: "off" })]);
    expect(computeDays(added, ["2026-10-07"], plans([]), RULES, "2026-10-12T12:00:00Z")[0]!.workedSeconds).toBe(4 * 3600);
  });
});

describe("Regras ao picar", () => {
  const OFF: PunchPolicy = { ipAllowlist: [], blockBeforeStartMinutes: null, requireCoordinates: false, blockOutsideGeofence: false };
  const CTX = { nowUtc: "2026-10-07T07:40:00Z", timeZone: TZ, ip: "198.51.100.1", latitude: null, longitude: null, plannedStart: "09:00", isEntry: true, location: null };

  test("RE_12_bloqueio_antes_da_entrada", () => {
    // 08:40 local, entrada 09:00, margem 10 min → recusa; margem 30 → aceita.
    expect(checkPunch({ ...OFF, blockBeforeStartMinutes: 10 }, CTX)).toBe("before_start");
    expect(checkPunch({ ...OFF, blockBeforeStartMinutes: 30 }, CTX)).toBeNull();
    expect(checkPunch({ ...OFF, blockBeforeStartMinutes: 10 }, { ...CTX, isEntry: false })).toBeNull();
  });

  test("CF_11_raio_200m_recusa_a_350m_e_aceita_a_150m (RE_13)", () => {
    const centre = { latitude: 41.1496, longitude: -8.611, radiusMeters: 200 };
    const north = (m: number) => ({ latitude: centre.latitude + m / 111_320, longitude: centre.longitude });
    expect(Math.round(distanceMeters(centre, north(350)))).toBe(350);
    const policy = { ...OFF, requireCoordinates: true, blockOutsideGeofence: true };
    expect(checkPunch(policy, { ...CTX, isEntry: false, ...north(350), location: centre })).toBe("outside_geofence");
    expect(checkPunch(policy, { ...CTX, isEntry: false, ...north(150), location: centre })).toBeNull();
    expect(checkPunch(policy, { ...CTX, isEntry: false, location: centre })).toBe("coordinates_required");
  });

  test("restrição por IP", () => {
    expect(checkPunch({ ...OFF, ipAllowlist: ["203.0.113.9"] }, CTX)).toBe("ip_not_allowed");
    expect(checkPunch({ ...OFF, ipAllowlist: ["198.51.100.1"] }, CTX)).toBeNull();
  });
});

describe("Quadro do dia (painel da gestão)", () => {
  const rules = { ...RULES, toleranceMinutes: 5 };
  const p = plans([["2026-10-07", { plannedStart: "09:00", plannedEnd: "17:00" }]]);

  test("atraso em minutos a contar do início planeado; registo aberto agora", () => {
    const events = [ev("2026-10-07T09:17:30", "work")];
    const [day] = computeDays(eff(events), ["2026-10-07"], p, rules, "2026-10-07T11:00:00Z");
    const b = dayBoard(day!, p.get("2026-10-07"), rules, "2026-10-07T11:00:00Z");
    expect(b).toMatchObject({ plannedStart: "09:00", lateMinutes: 17, startPassed: true, openType: "work" });
    expect(b.firstInAt).toBe("2026-10-07T08:17:30.000Z");
  });

  test("dentro da tolerância não é atraso; sem marcação antes da hora = ainda não começou", () => {
    const [ontime] = computeDays(eff([ev("2026-10-07T09:04:00", "work"), ev("2026-10-07T17:00:00", "off")]), ["2026-10-07"], p, rules, "2026-10-07T18:00:00Z");
    expect(dayBoard(ontime!, p.get("2026-10-07"), rules, "2026-10-07T18:00:00Z")).toMatchObject({ lateMinutes: 0, openType: null });
    const [empty] = computeDays([], ["2026-10-07"], p, rules, "2026-10-07T07:30:00Z");
    expect(dayBoard(empty!, p.get("2026-10-07"), rules, "2026-10-07T07:30:00Z")).toMatchObject({ firstInAt: null, startPassed: false });
    expect(dayBoard(empty!, p.get("2026-10-07"), rules, "2026-10-07T08:10:00Z").startPassed).toBe(true);
  });
});
