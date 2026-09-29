import { WorkShift } from "../../domain/entities/work-shift.js";
import { BaseScheduleTemplate } from "../../domain/entities/base-schedule-template.js";
import { detectOverlaps, detectMissingCoverage, countPendingPublish } from "../../domain/services/schedule-alerts.service.js";
import { weekdayOf } from "../../application/use-cases/schedule-shared.js";

function shift(overrides: Partial<Parameters<typeof WorkShift.create>[0]> = {}) {
  return WorkShift.create({
    employeeId: "emp-1",
    workDate: "2026-08-10",
    startTime: "09:00",
    endTime: "17:00",
    locationId: "loc-1",
    ...overrides,
  });
}

describe("detectOverlaps", () => {
  it("não gera alerta quando os turnos do dia não se tocam", () => {
    const shifts = [shift({ startTime: "09:00", endTime: "13:00" }), shift({ startTime: "14:00", endTime: "18:00" })];
    expect(detectOverlaps(shifts)).toEqual([]);
  });

  it("gera alerta quando 2 turnos do mesmo colaborador/dia se sobrepõem", () => {
    const shifts = [shift({ startTime: "09:00", endTime: "14:00" }), shift({ startTime: "13:00", endTime: "18:00" })];
    const overlaps = detectOverlaps(shifts);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]!.shiftIds).toHaveLength(2);
  });

  it("não gera alerta entre colaboradores diferentes no mesmo horário", () => {
    const shifts = [
      shift({ employeeId: "emp-1", startTime: "09:00", endTime: "14:00" }),
      shift({ employeeId: "emp-2", startTime: "09:00", endTime: "14:00" }),
    ];
    expect(detectOverlaps(shifts)).toEqual([]);
  });
});

describe("detectMissingCoverage", () => {
  const weekDates = ["2026-08-10", "2026-08-11", "2026-08-12"]; // Seg, Ter, Qua

  it("gera alerta quando a escala base prevê trabalho mas não há turno", () => {
    const template = BaseScheduleTemplate.createWorkingDay({
      employeeId: "emp-1",
      weekday: weekdayOf("2026-08-10"),
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    const gaps = detectMissingCoverage({
      templatesByEmployee: new Map([["emp-1", [template]]]),
      shifts: [],
      weekDates,
      weekdayOf,
      employeeIdsOnLeaveByDate: new Map(),
      holidayDates: new Set(),
    });
    expect(gaps).toEqual([{ employeeId: "emp-1", workDate: "2026-08-10", locationId: "loc-1" }]);
  });

  it("não gera alerta quando já existe turno nesse dia", () => {
    const template = BaseScheduleTemplate.createWorkingDay({
      employeeId: "emp-1",
      weekday: weekdayOf("2026-08-10"),
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    const gaps = detectMissingCoverage({
      templatesByEmployee: new Map([["emp-1", [template]]]),
      shifts: [shift({ workDate: "2026-08-10" })],
      weekDates,
      weekdayOf,
      employeeIdsOnLeaveByDate: new Map(),
      holidayDates: new Set(),
    });
    expect(gaps).toEqual([]);
  });

  it("não gera alerta em dia de Folga da escala base", () => {
    const dayOff = BaseScheduleTemplate.createDayOff("emp-1", weekdayOf("2026-08-10"));
    const gaps = detectMissingCoverage({
      templatesByEmployee: new Map([["emp-1", [dayOff]]]),
      shifts: [],
      weekDates,
      weekdayOf,
      employeeIdsOnLeaveByDate: new Map(),
      holidayDates: new Set(),
    });
    expect(gaps).toEqual([]);
  });

  it("não gera alerta quando o colaborador está de férias/ausência nesse dia", () => {
    const template = BaseScheduleTemplate.createWorkingDay({
      employeeId: "emp-1",
      weekday: weekdayOf("2026-08-10"),
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    const gaps = detectMissingCoverage({
      templatesByEmployee: new Map([["emp-1", [template]]]),
      shifts: [],
      weekDates,
      weekdayOf,
      employeeIdsOnLeaveByDate: new Map([["2026-08-10", new Set(["emp-1"])]]),
      holidayDates: new Set(),
    });
    expect(gaps).toEqual([]);
  });

  it("não gera alerta quando o dia é feriado", () => {
    const template = BaseScheduleTemplate.createWorkingDay({
      employeeId: "emp-1",
      weekday: weekdayOf("2026-08-10"),
      startTime: "09:00",
      endTime: "17:00",
      locationId: "loc-1",
    });
    const gaps = detectMissingCoverage({
      templatesByEmployee: new Map([["emp-1", [template]]]),
      shifts: [],
      weekDates,
      weekdayOf,
      employeeIdsOnLeaveByDate: new Map(),
      holidayDates: new Set(["2026-08-10"]),
    });
    expect(gaps).toEqual([]);
  });

  it("sem escala base configurada, nunca gera alerta", () => {
    const gaps = detectMissingCoverage({
      templatesByEmployee: new Map(),
      shifts: [],
      weekDates,
      weekdayOf,
      employeeIdsOnLeaveByDate: new Map(),
      holidayDates: new Set(),
    });
    expect(gaps).toEqual([]);
  });
});

describe("countPendingPublish", () => {
  it("conta só os turnos em rascunho", () => {
    const shifts = [shift({ status: "draft" }), shift({ status: "published" }), shift({ status: "draft" })];
    expect(countPendingPublish(shifts)).toBe(2);
  });
});
