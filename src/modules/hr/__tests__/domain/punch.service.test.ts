import { planPunch, type PunchAttendance, type PunchShift } from "../../domain/services/punch.service.js";
import { classifyGeofence, decideGeofence, distanceMeters, type LocationFence } from "../../domain/services/punch-geofence.service.js";

const TODAY = "2026-10-07";
const YESTERDAY = "2026-10-06";

function shift(overrides: Partial<PunchShift> = {}): PunchShift {
  return { id: "s1", workDate: TODAY, startTime: "09:00", endTime: "17:00", endsNextDay: false, locationId: "loc-1", ...overrides };
}
function att(overrides: Partial<PunchAttendance> = {}): PunchAttendance {
  return { id: "a1", workShiftId: "s1", status: "worked_as_planned", actualStartTime: "09:00", actualEndTime: null, ...overrides };
}
const at = (time: string, date = TODAY) => ({ date, time });

describe("planPunch — Entrada/Saída", () => {
  it("entrada a horas → worked_as_planned; atrasada → late com minutos; usa sempre a hora do servidor dada", () => {
    expect(planPunch("in", at("08:55"), [shift()], [], 30)).toMatchObject({ ok: true, kind: "in", status: "worked_as_planned", lateMinutes: null, time: "08:55" });
    expect(planPunch("in", at("09:07"), [shift()], [], 30)).toMatchObject({ ok: true, kind: "in", status: "late", lateMinutes: 7 });
  });

  it("recusa entrada antes da janela, sem turno, depois do fim, e Entrada → Entrada", () => {
    expect(planPunch("in", at("08:00"), [shift()], [], 30)).toEqual({ ok: false, refusal: { code: "TOO_EARLY", shiftStart: "09:00", opensAt: "08:30" } });
    expect(planPunch("in", at("09:00"), [], [], 30)).toEqual({ ok: false, refusal: { code: "NO_SHIFT" } });
    expect(planPunch("in", at("17:30"), [shift()], [], 30)).toEqual({ ok: false, refusal: { code: "SHIFT_ENDED" } });
    expect(planPunch("in", at("10:00"), [shift()], [att()], 30)).toEqual({ ok: false, refusal: { code: "ALREADY_IN", since: "09:00" } });
  });

  it("saída: normal, antecipada (left_early), sem entrada, mesmo minuto, e dia completo", () => {
    expect(planPunch("out", at("17:02"), [shift()], [att()], 30)).toMatchObject({ ok: true, kind: "out", status: "worked_as_planned" });
    expect(planPunch("out", at("16:00"), [shift()], [att()], 30)).toMatchObject({ ok: true, kind: "out", status: "left_early" });
    expect(planPunch("out", at("16:00"), [shift()], [att({ status: "late" })], 30)).toMatchObject({ ok: true, status: "late" });
    expect(planPunch("out", at("10:00"), [shift()], [], 30)).toEqual({ ok: false, refusal: { code: "NOT_IN" } });
    expect(planPunch("out", at("09:00"), [shift()], [att()], 30)).toEqual({ ok: false, refusal: { code: "TOO_SOON" } });
    expect(planPunch("in", at("18:00"), [shift()], [att({ actualEndTime: "17:00" })], 30)).toEqual({ ok: false, refusal: { code: "DAY_COMPLETE" } });
  });

  it("turno noturno de ontem: a saída depois da meia-noite encontra o turno; antes do fim é saída antecipada", () => {
    const night = shift({ id: "n1", workDate: YESTERDAY, startTime: "20:00", endTime: "00:30", endsNextDay: true });
    const open = att({ workShiftId: "n1", actualStartTime: "20:00" });
    expect(planPunch("out", at("00:35"), [night], [open], 30)).toMatchObject({ ok: true, kind: "out", shift: { id: "n1" }, status: "worked_as_planned", time: "00:35" });
    expect(planPunch("out", at("00:10"), [night], [open], 30)).toMatchObject({ ok: true, status: "left_early" });
  });

  it("dois turnos no mesmo dia: entra no segundo depois de fechar o primeiro", () => {
    const morning = shift({ id: "m", startTime: "09:00", endTime: "12:00" });
    const evening = shift({ id: "e", startTime: "18:00", endTime: "22:00" });
    const done = att({ workShiftId: "m", actualEndTime: "12:00" });
    expect(planPunch("in", at("17:45"), [morning, evening], [done], 30)).toMatchObject({ ok: true, kind: "in", shift: { id: "e" } });
  });
});

describe("Geolocalização na picagem", () => {
  // Coordenadas fictícias de teste.
  const FENCE: LocationFence = { latitude: 41.1, longitude: -8.6, radiusM: 100, policy: "warn" };
  // ~0.0009° de latitude ≈ 100 m
  const north = (meters: number) => 41.1 + meters / 111_195;

  it("distância haversine aproximada", () => {
    expect(Math.round(distanceMeters({ latitude: 41.1, longitude: -8.6 }, { latitude: north(250), longitude: -8.6 }))).toBe(250);
  });

  it("dentro / fora / ambíguo / impreciso / sem leitura / política off", () => {
    const reading = (m: number, accuracyM: number) => ({ kind: "reading" as const, latitude: north(m), longitude: -8.6, accuracyM });
    expect(classifyGeofence(FENCE, reading(40, 10)).status).toBe("inside");
    expect(classifyGeofence(FENCE, reading(300, 10))).toMatchObject({ status: "outside" });
    expect(classifyGeofence(FENCE, reading(120, 50))).toMatchObject({ status: "unverified", reason: "ambiguous" });
    // 120 m de distância com ±200 m não é "fora" — é imprecisa.
    expect(classifyGeofence(FENCE, reading(120, 200))).toMatchObject({ status: "unverified", reason: "low_accuracy" });
    expect(classifyGeofence(FENCE, { kind: "error", reason: "permission_denied" })).toMatchObject({ status: "unverified", reason: "permission_denied" });
    expect(classifyGeofence({ ...FENCE, latitude: null, longitude: null }, reading(0, 5))).toMatchObject({ status: "unverified", reason: "location_not_configured" });
    expect(classifyGeofence({ ...FENCE, policy: "off" }, reading(5000, 5))).toEqual({ status: "not_required", reason: null, distanceM: null });
  });

  it("políticas: warn aceita e alerta; block recusa só 'fora' e aceita 'não verificada' com alerta", () => {
    const outside = { status: "outside" as const, reason: null, distanceM: 300 };
    const unverified = { status: "unverified" as const, reason: "low_accuracy" as const, distanceM: 120 };
    const inside = { status: "inside" as const, reason: null, distanceM: 10 };
    expect(decideGeofence("warn", outside)).toEqual({ allowed: true, alert: true });
    expect(decideGeofence("block", outside)).toEqual({ allowed: false, alert: false });
    expect(decideGeofence("block", unverified)).toEqual({ allowed: true, alert: true });
    expect(decideGeofence("block", inside)).toEqual({ allowed: true, alert: false });
    expect(decideGeofence("off", outside)).toEqual({ allowed: true, alert: false });
  });
});
