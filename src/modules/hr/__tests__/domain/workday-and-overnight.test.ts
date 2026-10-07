import { DateTime } from "luxon";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { DEFAULT_ATTENDANCE_RULES } from "../../domain/entities/attendance-rules.js";
import { Employee } from "../../domain/entities/employee.js";
import { assertShiftShape } from "../../domain/entities/work-shift.js";
import { InvalidWorkShiftError, InvalidWorkdayRulesError } from "../../domain/errors.js";
import { sumActualMinutes } from "../../domain/services/attendance-conference.service.js";
import { classifyByTolerance } from "../../domain/services/attendance-tolerance.service.js";
import { actualPeriodMinutes, clockDiffMinutes, plannedRange } from "../../domain/services/shift-clock.service.js";
import { assertWorkdayRules, classifyWorkday, summarizeWorkdays } from "../../domain/services/workday.service.js";
import { GetMonthlyAttendanceSummaryUseCase } from "../../application/use-cases/get-monthly-attendance-summary.use-case.js";
import type { ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";
import { FakeAttendanceCorrectionRepository } from "../fakes/fake-attendance-correction-repository.js";
import { FakeAttendanceRulesRepository } from "../fakes/fake-attendance-rules-repository.js";
import { FakeEmployeeRepository } from "../fakes/fake-employee-repository.js";
import { FakeLeaveReadAdapter } from "../fakes/fake-leave-read.js";
import { FakeMonthlyClosureRepository } from "../fakes/fake-monthly-closure-repository.js";
import { FakeShiftAttendanceReadAdapter } from "../fakes/fake-shift-attendance-read.js";

const RULES = DEFAULT_ATTENDANCE_RULES; // 8h, tolerância de fecho 1h30, dupla a partir de 12h
const h = (hours: number) => hours * 60;

describe("Jornada — 1 turno / 1,5 / dupla", () => {
  it("limpeza depois da meia-noite (até 1h30 a mais) continua a ser 1 turno", () => {
    expect(classifyWorkday(h(8), RULES)).toBe(1);
    expect(classifyWorkday(h(9.5), RULES)).toBe(1);
  });

  it("acima do turno + tolerância conta 1,5; a partir de 12h (ex.: 4h + 8h) conta 2", () => {
    expect(classifyWorkday(h(9.5) + 1, RULES)).toBe(1.5);
    expect(classifyWorkday(h(11.9), RULES)).toBe(1.5);
    expect(classifyWorkday(h(4) + h(8), RULES)).toBe(2);
    expect(classifyWorkday(0, RULES)).toBe(0);
  });

  it("soma os turnos do mesmo dia numa só jornada", () => {
    const t = summarizeWorkdays(
      [
        { workDate: "2026-10-05", minutes: h(4) },
        { workDate: "2026-10-05", minutes: h(8) },
        { workDate: "2026-10-06", minutes: h(9) },
      ],
      () => RULES,
    );
    expect(t).toEqual({ days: 2, shiftEquivalents: 3, oneAndHalfDays: 0, doubleDays: 1 });
  });

  it("limites incoerentes são recusados", () => {
    expect(() => assertWorkdayRules({ standardShiftMinutes: 480, closingToleranceMinutes: 90, doubleShiftFromMinutes: 570 })).toThrow(InvalidWorkdayRulesError);
    expect(() => assertWorkdayRules({ standardShiftMinutes: 0, closingToleranceMinutes: 0, doubleShiftFromMinutes: 60 })).toThrow(InvalidWorkdayRulesError);
    expect(() => assertWorkdayRules({ standardShiftMinutes: 480, closingToleranceMinutes: 90, doubleShiftFromMinutes: 720 })).not.toThrow();
  });
});

describe("Viragem do dia nas marcações", () => {
  it("hora real vai para o dia mais próximo da planeada", () => {
    expect(clockDiffMinutes("00:10", h(23) + 50)).toBe(20); // entrada atrasada depois da meia-noite
    expect(clockDiffMinutes("00:40", h(23) + 30)).toBe(70); // saída de fecho depois da meia-noite
    expect(clockDiffMinutes("05:30", h(30))).toBe(-30); // saída 05:30 num noturno que acaba às 06:00 (+1)
  });

  it("noturno: entrada tardia depois da meia-noite não soma 24h", () => {
    const planned = plannedRange("23:50", "06:00", true);
    expect(actualPeriodMinutes("00:10", "06:00", planned)).toBe(h(5) + 50);
    expect(sumActualMinutes([{ plannedStart: "23:50", plannedEnd: "06:00", actualStart: "00:10", actualEnd: "06:00" }], true)).toBe(h(5) + 50);
  });

  it("turno diurno com saída depois da meia-noite conta as horas certas", () => {
    expect(sumActualMinutes([{ plannedStart: "18:00", plannedEnd: "23:30", actualStart: "18:00", actualEnd: "00:45" }], false)).toBe(h(6) + 45);
  });

  it("tolerâncias: atraso depois da meia-noite e saída antes da meia-noite num noturno", () => {
    const now = DateTime.fromISO("2026-10-08T12:00", { zone: "Europe/Lisbon" });
    const late = classifyByTolerance([{ plannedStart: "23:50", plannedEnd: "06:00", actualStart: "00:10", actualEnd: "06:00" }], "2026-10-06", true, RULES, now);
    expect(late).toEqual({ kind: "late_entry", diffMinutes: 20 });
    const early = classifyByTolerance([{ plannedStart: "22:00", plannedEnd: "06:00", actualStart: "22:00", actualEnd: "23:50" }], "2026-10-06", true, RULES, now);
    expect(early).toEqual({ kind: "early_exit", diffMinutes: -370 });
    const closing = classifyByTolerance([{ plannedStart: "18:00", plannedEnd: "23:30", actualStart: "18:00", actualEnd: "00:10" }], "2026-10-06", false, RULES, now);
    expect(closing.kind).toBe("ok");
  });
});

describe("Turno que termina no dia seguinte", () => {
  const base = { secondStartTime: null, secondEndTime: null };
  it("fim antes do início (18:00–01:30, 20:00–00:00) é válido", () => {
    expect(() => assertShiftShape({ ...base, startTime: "18:00", endTime: "01:30", endsNextDay: true })).not.toThrow();
    expect(() => assertShiftShape({ ...base, startTime: "20:00", endTime: "00:00", endsNextDay: true })).not.toThrow();
  });
  it("20:00–23:59 marcado como dia seguinte (≈28h) é recusado", () => {
    expect(() => assertShiftShape({ ...base, startTime: "20:00", endTime: "23:59", endsNextDay: true })).toThrow(InvalidWorkShiftError);
  });
});

describe("Resumo mensal — jornadas pelas horas reais", () => {
  const ORG = mintOrganizationId("org-test");
  const occ = (o: Partial<ShiftOccurrence>): ShiftOccurrence => ({
    shiftId: "s",
    employeeId: "e1",
    workDate: "2026-09-05",
    startTime: "09:00",
    endTime: "17:00",
    endsNextDay: false,
    secondStartTime: null,
    secondEndTime: null,
    locationId: "loc1",
    attendanceStatus: null,
    actualStartTime: null,
    actualEndTime: null,
    lateMinutes: null,
    ...o,
  });

  it("noturno com limpeza = 1 jornada de 1 turno; 4h + 8h no mesmo dia = dupla", async () => {
    const employees = new FakeEmployeeRepository();
    const shifts = new FakeShiftAttendanceReadAdapter();
    const emp = Employee.create({ fullName: "Carla Demo" });
    employees.seed(ORG, emp);
    shifts.seed(ORG, occ({ shiftId: "a", employeeId: emp.id, workDate: "2026-09-05", startTime: "17:00", endTime: "00:30", endsNextDay: true, actualStartTime: "17:00", actualEndTime: "01:30" }));
    shifts.seed(ORG, occ({ shiftId: "b", employeeId: emp.id, workDate: "2026-09-06", startTime: "08:00", endTime: "12:00", actualStartTime: "08:00", actualEndTime: "12:00" }));
    shifts.seed(ORG, occ({ shiftId: "c", employeeId: emp.id, workDate: "2026-09-06", startTime: "15:00", endTime: "23:00", actualStartTime: "15:00", actualEndTime: "23:00" }));
    const uc = new GetMonthlyAttendanceSummaryUseCase(employees, shifts, new FakeLeaveReadAdapter(), new FakeAttendanceRulesRepository(), new FakeAttendanceCorrectionRepository(), new FakeMonthlyClosureRepository());

    const row = (await uc.execute({ organizationId: ORG, year: 2026, month: 9 })).rows.find((r) => r.employeeId === emp.id)!;
    expect(row).toMatchObject({ plannedShiftsCount: 3, workedDaysCount: 2, shiftEquivalents: 3, doubleDaysCount: 1, oneAndHalfDaysCount: 0 });
    expect(row.actualMinutes).toBe(h(8) + 30 + h(4) + h(8));
  });
});
