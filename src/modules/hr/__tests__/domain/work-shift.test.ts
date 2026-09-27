import { WorkShift } from "../../domain/entities/work-shift.js";
import { InvalidWorkShiftError } from "../../domain/errors.js";

function makeShift(overrides: Partial<Parameters<typeof WorkShift.create>[0]> = {}) {
  return WorkShift.create({
    employeeId: "emp-1",
    workDate: "2026-08-10",
    startTime: "09:00",
    endTime: "17:00",
    locationId: "loc-1",
    ...overrides,
  });
}

describe("WorkShift", () => {
  it("create() começa em rascunho por omissão", () => {
    const shift = makeShift();
    expect(shift.status).toBe("draft");
    expect(shift.source).toBe("manual");
  });

  it("create() aceita status/source explícitos", () => {
    const shift = makeShift({ status: "published", source: "base_schedule" });
    expect(shift.status).toBe("published");
    expect(shift.source).toBe("base_schedule");
  });

  it("rejeita hora de início >= hora de fim", () => {
    expect(() => makeShift({ startTime: "17:00", endTime: "09:00" })).toThrow(InvalidWorkShiftError);
    expect(() => makeShift({ startTime: "09:00", endTime: "09:00" })).toThrow(InvalidWorkShiftError);
  });

  it("applyManualEdit() marca sempre source='manual', mesmo vindo de base_schedule/rotation", () => {
    const generated = makeShift({ source: "base_schedule" });
    const edited = generated.applyManualEdit({ startTime: "10:00" });
    expect(edited.source).toBe("manual");
    expect(edited.startTime).toBe("10:00");
    expect(edited.endTime).toBe("17:00");
  });

  it("applyManualEdit() valida a nova ordem das horas", () => {
    const shift = makeShift();
    expect(() => shift.applyManualEdit({ startTime: "18:00" })).toThrow(InvalidWorkShiftError);
  });

  it("overwriteFromTemplate() substitui horário/loja e marca a source pedida", () => {
    const shift = makeShift({ source: "base_schedule" });
    const overwritten = shift.overwriteFromTemplate({
      startTime: "08:00",
      endTime: "16:00",
      locationId: "loc-2",
      breakMinutes: 30,
      source: "base_schedule",
    });
    expect(overwritten.startTime).toBe("08:00");
    expect(overwritten.locationId).toBe("loc-2");
    expect(overwritten.breakMinutes).toBe(30);
    expect(overwritten.source).toBe("base_schedule");
  });

  it("publish() muda o estado para published sem tocar no resto", () => {
    const shift = makeShift();
    const published = shift.publish();
    expect(published.status).toBe("published");
    expect(published.startTime).toBe(shift.startTime);
  });

  // ── Turno repartido ──────────────────────────────────────────────────────

  it("turno repartido: kind='split' e segments tem os 2 períodos", () => {
    const shift = makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" });
    expect(shift.kind).toBe("split");
    expect(shift.segments).toEqual([
      { startTime: "12:00", endTime: "16:00" },
      { startTime: "19:00", endTime: "23:00" },
    ]);
  });

  it("turno direto: kind='direct' e segments tem só 1 período", () => {
    const shift = makeShift();
    expect(shift.kind).toBe("direct");
    expect(shift.segments).toEqual([{ startTime: "09:00", endTime: "17:00" }]);
  });

  it("rejeita 2º período sobreposto ao 1º", () => {
    expect(() => makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "15:00", secondEndTime: "20:00" })).toThrow(
      InvalidWorkShiftError,
    );
  });

  it("rejeita 2º período com início >= fim", () => {
    expect(() => makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "19:00" })).toThrow(
      InvalidWorkShiftError,
    );
  });

  it("durationMinutes() soma os 2 períodos de um turno repartido", () => {
    const shift = makeShift({ startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" });
    expect(shift.durationMinutes()).toBe(4 * 60 + 4 * 60);
  });

  // ── Turno noturno ────────────────────────────────────────────────────────

  it("turno noturno: aceita endTime <= startTime quando endsNextDay=true", () => {
    const shift = makeShift({ startTime: "22:00", endTime: "06:00", endsNextDay: true });
    expect(shift.endsNextDay).toBe(true);
    expect(shift.endTime).toBe("06:00");
  });

  it("durationMinutes() de um turno noturno atravessa a meia-noite corretamente", () => {
    const shift = makeShift({ startTime: "22:00", endTime: "06:00", endsNextDay: true });
    expect(shift.durationMinutes()).toBe(8 * 60);
  });

  it("rejeita turno noturno com 2º período (repartido + noturno não é suportado na V1)", () => {
    expect(() =>
      makeShift({ startTime: "22:00", endTime: "06:00", endsNextDay: true, secondStartTime: "10:00", secondEndTime: "12:00" }),
    ).toThrow(InvalidWorkShiftError);
  });

  it("sem endsNextDay, ainda exige startTime < endTime mesmo com valores parecidos com turno noturno", () => {
    expect(() => makeShift({ startTime: "22:00", endTime: "06:00", endsNextDay: false })).toThrow(InvalidWorkShiftError);
  });

  // ── Série ────────────────────────────────────────────────────────────────

  it("applyManualEdit() destaca sempre o turno da série (seriesId → null)", () => {
    const shift = makeShift({ seriesId: "serie-1" });
    const edited = shift.applyManualEdit({ startTime: "10:00" });
    expect(edited.seriesId).toBeNull();
    expect(edited.source).toBe("manual");
  });

  it("applySeriesEdit() preserva seriesId e source", () => {
    const shift = makeShift({ seriesId: "serie-1", source: "manual" });
    const edited = shift.applySeriesEdit({ startTime: "10:00" });
    expect(edited.seriesId).toBe("serie-1");
    expect(edited.startTime).toBe("10:00");
  });
});
