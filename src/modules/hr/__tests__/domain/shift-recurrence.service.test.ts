import { WorkShift } from "../../domain/entities/work-shift.js";
import {
  expandRecurrence,
  occurrenceOverlapsShift,
  partitionOccurrences,
  type PlannedOccurrence,
  type RecurrenceSpec,
} from "../../domain/services/shift-recurrence.service.js";

const MORNING = [{ startTime: "09:00", endTime: "17:00" }];

function makeExistingShift(overrides: Partial<Parameters<typeof WorkShift.create>[0]> = {}) {
  return WorkShift.create({
    employeeId: "emp-1",
    workDate: "2026-09-28",
    startTime: "09:00",
    endTime: "17:00",
    locationId: "loc-1",
    ...overrides,
  });
}

describe("expandRecurrence", () => {
  it("repeat 'none' expande só a semana seguinte ao startDate (janela de 7 dias)", () => {
    const spec: RecurrenceSpec = {
      startDate: "2026-09-28", // segunda-feira
      rules: [{ weekdays: [0], segments: MORNING }],
      repeat: { kind: "none" },
    };
    const occurrences = expandRecurrence(spec);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]!.workDate).toBe("2026-09-28");
    expect(occurrences[0]!.weekday).toBe(0);
  });

  it("cenário B: mesmo horário 3x/semana (seg/qua/sex) durante 4 semanas → 12 turnos", () => {
    const spec: RecurrenceSpec = {
      startDate: "2026-09-28",
      rules: [{ weekdays: [0, 2, 4], segments: MORNING }],
      repeat: { kind: "weeks", weeks: 4 },
    };
    const occurrences = expandRecurrence(spec);
    expect(occurrences).toHaveLength(12);
    expect(occurrences[0]!.workDate).toBe("2026-09-28");
    expect(occurrences.at(-1)!.workDate).toBe("2026-10-23");
  });

  it("cenário C: dias diferentes da semana com horários diferentes, 1 semana", () => {
    const spec: RecurrenceSpec = {
      startDate: "2026-09-28",
      rules: [
        { weekdays: [0, 1], segments: [{ startTime: "08:00", endTime: "16:00" }] },
        { weekdays: [2, 3, 4], segments: [{ startTime: "12:00", endTime: "20:00" }] },
      ],
      repeat: { kind: "none" },
    };
    const occurrences = expandRecurrence(spec);
    expect(occurrences).toHaveLength(5);
    const mondayTuesday = occurrences.filter((o) => o.workDate === "2026-09-28" || o.workDate === "2026-09-29");
    expect(mondayTuesday.every((o) => o.segments[0]!.startTime === "08:00")).toBe(true);
    const wedToFri = occurrences.filter((o) => ["2026-09-30", "2026-10-01", "2026-10-02"].includes(o.workDate));
    expect(wedToFri.every((o) => o.segments[0]!.startTime === "12:00")).toBe(true);
    // sábado/domingo sem regra correspondente — não geram turno
    expect(occurrences.some((o) => o.workDate === "2026-10-03" || o.workDate === "2026-10-04")).toBe(false);
  });

  it("repeat 'until_date' atravessa a mudança de mês sem lógica especial ('semana 5')", () => {
    const spec: RecurrenceSpec = {
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments: MORNING }],
      repeat: { kind: "until_date", untilDate: "2026-10-11" },
    };
    const occurrences = expandRecurrence(spec);
    expect(occurrences.map((o) => o.workDate)).toEqual(["2026-09-28", "2026-10-05"]);
  });

  it("turno repartido: cada ocorrência mantém os 2 segmentos da regra", () => {
    const segments = [
      { startTime: "09:00", endTime: "13:00" },
      { startTime: "15:00", endTime: "19:00" },
    ];
    const spec: RecurrenceSpec = {
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments }],
      repeat: { kind: "none" },
    };
    const occurrences = expandRecurrence(spec);
    expect(occurrences[0]!.segments).toEqual(segments);
  });

  it("turno noturno: ocorrência marca endsNextDay conforme a regra", () => {
    const spec: RecurrenceSpec = {
      startDate: "2026-09-28",
      rules: [{ weekdays: [0], segments: [{ startTime: "22:00", endTime: "06:00" }], endsNextDay: true }],
      repeat: { kind: "none" },
    };
    const occurrences = expandRecurrence(spec);
    expect(occurrences[0]!.endsNextDay).toBe(true);
  });
});

describe("occurrenceOverlapsShift", () => {
  it("deteta sobreposição direta no mesmo dia", () => {
    const occurrence: PlannedOccurrence = {
      workDate: "2026-09-28",
      weekday: 0,
      segments: [{ startTime: "10:00", endTime: "14:00" }],
      endsNextDay: false,
    };
    const shift = makeExistingShift({ workDate: "2026-09-28", startTime: "09:00", endTime: "17:00" });
    expect(occurrenceOverlapsShift(occurrence, shift)).toBe(true);
  });

  it("não deteta sobreposição quando os horários não se cruzam no mesmo dia", () => {
    const occurrence: PlannedOccurrence = {
      workDate: "2026-09-28",
      weekday: 0,
      segments: [{ startTime: "18:00", endTime: "20:00" }],
      endsNextDay: false,
    };
    const shift = makeExistingShift({ workDate: "2026-09-28", startTime: "09:00", endTime: "17:00" });
    expect(occurrenceOverlapsShift(occurrence, shift)).toBe(false);
  });

  it("deteta sobreposição no 2º segmento de um turno repartido", () => {
    const occurrence: PlannedOccurrence = {
      workDate: "2026-09-28",
      weekday: 0,
      segments: [
        { startTime: "09:00", endTime: "13:00" },
        { startTime: "18:00", endTime: "22:00" },
      ],
      endsNextDay: false,
    };
    const shift = makeExistingShift({ workDate: "2026-09-28", startTime: "19:00", endTime: "21:00" });
    expect(occurrenceOverlapsShift(occurrence, shift)).toBe(true);
  });

  it("turno noturno sobrepõe um turno da manhã seguinte", () => {
    const occurrence: PlannedOccurrence = {
      workDate: "2026-09-28",
      weekday: 0,
      segments: [{ startTime: "22:00", endTime: "06:00" }],
      endsNextDay: true,
    };
    const shift = makeExistingShift({ workDate: "2026-09-29", startTime: "05:00", endTime: "09:00" });
    expect(occurrenceOverlapsShift(occurrence, shift)).toBe(true);
  });

  it("turno noturno do dia anterior que invade a manhã sobrepõe um turno direto desse dia", () => {
    const occurrence: PlannedOccurrence = {
      workDate: "2026-09-28",
      weekday: 0,
      segments: [{ startTime: "07:00", endTime: "15:00" }],
      endsNextDay: false,
    };
    const shift = makeExistingShift({
      workDate: "2026-09-27",
      startTime: "22:00",
      endTime: "08:00",
      endsNextDay: true,
    });
    expect(occurrenceOverlapsShift(occurrence, shift)).toBe(true);
  });

  it("nunca compara turnos com mais de 1 dia de diferença", () => {
    const occurrence: PlannedOccurrence = {
      workDate: "2026-09-28",
      weekday: 0,
      segments: [{ startTime: "00:00", endTime: "23:59" }],
      endsNextDay: false,
    };
    const shift = makeExistingShift({ workDate: "2026-09-30", startTime: "00:00", endTime: "23:59" });
    expect(occurrenceOverlapsShift(occurrence, shift)).toBe(false);
  });
});

describe("partitionOccurrences", () => {
  const baseOccurrence: PlannedOccurrence = {
    workDate: "2026-09-28",
    weekday: 0,
    segments: MORNING,
    endsNextDay: false,
  };

  it("sem conflitos nem exceções: ocorrência vai para toCreate", () => {
    const result = partitionOccurrences({
      occurrences: [baseOccurrence],
      existingShifts: [],
      employeeOnLeaveDates: new Set(),
      holidayDates: new Set(),
    });
    expect(result.toCreate).toEqual([baseOccurrence]);
    expect(result.conflicts).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("ocorrência que sobrepõe um turno existente vai para conflicts", () => {
    const existing = makeExistingShift({ workDate: "2026-09-28", startTime: "09:00", endTime: "17:00" });
    const result = partitionOccurrences({
      occurrences: [baseOccurrence],
      existingShifts: [existing],
      employeeOnLeaveDates: new Set(),
      holidayDates: new Set(),
    });
    expect(result.conflicts).toEqual([baseOccurrence]);
    expect(result.toCreate).toEqual([]);
  });

  it("dia de ausência/férias é sempre saltado (skipped), mesmo sem turnos existentes", () => {
    const result = partitionOccurrences({
      occurrences: [baseOccurrence],
      existingShifts: [],
      employeeOnLeaveDates: new Set(["2026-09-28"]),
      holidayDates: new Set(),
    });
    expect(result.skipped).toEqual([{ ...baseOccurrence, reason: "leave" }]);
    expect(result.toCreate).toEqual([]);
  });

  it("feriado é sempre saltado (skipped)", () => {
    const result = partitionOccurrences({
      occurrences: [baseOccurrence],
      existingShifts: [],
      employeeOnLeaveDates: new Set(),
      holidayDates: new Set(["2026-09-28"]),
    });
    expect(result.skipped).toEqual([{ ...baseOccurrence, reason: "holiday" }]);
    expect(result.toCreate).toEqual([]);
  });

  it("ausência/feriado tem prioridade sobre a deteção de conflito", () => {
    const existing = makeExistingShift({ workDate: "2026-09-28", startTime: "09:00", endTime: "17:00" });
    const result = partitionOccurrences({
      occurrences: [baseOccurrence],
      existingShifts: [existing],
      employeeOnLeaveDates: new Set(["2026-09-28"]),
      holidayDates: new Set(),
    });
    expect(result.skipped).toEqual([{ ...baseOccurrence, reason: "leave" }]);
    expect(result.conflicts).toEqual([]);
  });
});
