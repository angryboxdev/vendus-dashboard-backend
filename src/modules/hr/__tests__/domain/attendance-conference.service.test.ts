import { DateTime } from "luxon";
import {
  computeAttendanceIssue,
  computeUnscheduledAttendanceIssue,
  describeAttendanceOccurrence,
} from "../../domain/services/attendance-conference.service.js";
import type { ShiftOccurrence, UnscheduledAttendanceOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { ActiveLeave } from "../../domain/ports/out/leave-read.port.js";

const WORK_DATE = "2026-09-27";
const NOW = DateTime.fromISO(`${WORK_DATE}T12:00:00`, { zone: "Europe/Lisbon" });
const NO_ISSUE = { hasOverlap: false, activeLeave: null as ActiveLeave | null };

function makeShift(overrides: Partial<ShiftOccurrence> = {}): ShiftOccurrence {
  return {
    shiftId: "s1",
    employeeId: "e1",
    workDate: WORK_DATE,
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
    ...overrides,
  };
}

describe("computeAttendanceIssue", () => {
  it("turno direto normal, sem nenhuma anomalia: Regular (null — nunca aparece na Conferência)", () => {
    const shift = makeShift({ actualStartTime: "09:00", actualEndTime: "17:00" });
    expect(computeAttendanceIssue(shift, NOW, NO_ISSUE)).toBeNull();
  });

  it("entrada atrasada, ainda presente: PRESENTE + Atraso", () => {
    const shift = makeShift({ actualStartTime: "09:18", attendanceStatus: "late", lateMinutes: 18 });
    const issue = computeAttendanceIssue(shift, NOW, NO_ISSUE);
    expect(issue?.state).toBe("PRESENTE");
    expect(issue?.occurrences).toContain("ATRASO");
    expect(describeAttendanceOccurrence(issue!)).toBe("Atraso 18 min");
  });

  it("atraso persiste como ocorrência mesmo depois de concluído (secção 9)", () => {
    const shift = makeShift({ actualStartTime: "09:18", actualEndTime: "17:00", attendanceStatus: "late", lateMinutes: 18 });
    const issue = computeAttendanceIssue(shift, NOW, NO_ISSUE);
    expect(issue?.state).toBe("CONCLUIDO");
    expect(describeAttendanceOccurrence(issue!)).toBe("Atraso 18 min");
  });

  it("sem entrada, depois do fim do turno: Ausente + Sem entrada", () => {
    const shift = makeShift();
    const afterEnd = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    const issue = computeAttendanceIssue(shift, afterEnd, NO_ISSUE);
    expect(issue?.state).toBe("AUSENTE");
    expect(describeAttendanceOccurrence(issue!)).toBe("Sem entrada");
  });

  it("sem entrada, ainda dentro da janela do turno: Regular (ainda não é pendência)", () => {
    const shift = makeShift();
    expect(computeAttendanceIssue(shift, NOW, NO_ISSUE)).toBeNull();
  });

  it("sem saída, depois do fim do turno: Em aberto + Sem saída", () => {
    const shift = makeShift({ actualStartTime: "09:00" });
    const afterEnd = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    const issue = computeAttendanceIssue(shift, afterEnd, NO_ISSUE);
    expect(issue?.state).toBe("EM_ABERTO");
    expect(describeAttendanceOccurrence(issue!)).toBe("Sem saída");
  });

  it("turno repartido: 1º período em falta, 2º realizado: Concluído + '1º período sem entrada'", () => {
    const shift = makeShift({
      startTime: "12:00",
      endTime: "15:00",
      secondStartTime: "18:00",
      secondEndTime: "23:00",
      actualStartTime: "18:02",
      actualEndTime: "23:01",
    });
    const issue = computeAttendanceIssue(shift, NOW, NO_ISSUE);
    expect(issue?.state).toBe("CONCLUIDO");
    expect(issue?.periods[0]).toEqual({ plannedStart: "12:00", plannedEnd: "15:00", actualStart: null, actualEnd: null });
    expect(describeAttendanceOccurrence(issue!)).toBe("1º período sem entrada");
  });

  it("turno repartido: 2º período em falta, ainda dentro da janela do 2º período: Parcial + '2º período sem entrada'", () => {
    const shift = makeShift({
      startTime: "12:00",
      endTime: "15:00",
      secondStartTime: "18:00",
      secondEndTime: "23:00",
      actualStartTime: "12:00",
      actualEndTime: null,
    });
    const duringSecondPeriod = DateTime.fromISO(`${WORK_DATE}T19:00:00`, { zone: "Europe/Lisbon" });
    const issue = computeAttendanceIssue(shift, duringSecondPeriod, NO_ISSUE);
    expect(issue?.state).toBe("PARCIAL");
    expect(describeAttendanceOccurrence(issue!)).toBe("2º período sem entrada");
  });

  it("turno noturno em curso, sem anomalia: Regular", () => {
    const shift = makeShift({ startTime: "22:00", endTime: "06:00", endsNextDay: true, actualStartTime: "22:00" });
    const duringNight = DateTime.fromISO(`${WORK_DATE}T22:00:00`, { zone: "Europe/Lisbon" }).plus({ hours: 3 });
    expect(computeAttendanceIssue(shift, duringNight, NO_ISSUE)).toBeNull();
  });

  it("turno noturno em aberto depois do fim (+1 dia): Conflito + 'Turno noturno em aberto'", () => {
    const shift = makeShift({ startTime: "22:00", endTime: "06:00", endsNextDay: true, actualStartTime: "22:00" });
    const afterEnd = DateTime.fromISO(`${WORK_DATE}T22:00:00`, { zone: "Europe/Lisbon" }).plus({ hours: 9 });
    const issue = computeAttendanceIssue(shift, afterEnd, NO_ISSUE);
    expect(issue?.state).toBe("CONFLITO");
    expect(describeAttendanceOccurrence(issue!)).toBe("Turno noturno em aberto");
  });

  it("duas entradas abertas em simultâneo: Conflito + 'Marcação duplicada'", () => {
    const shift = makeShift({ actualStartTime: "09:00" });
    const issue = computeAttendanceIssue(shift, NOW, { hasOverlap: true, activeLeave: null });
    expect(issue?.state).toBe("CONFLITO");
    expect(describeAttendanceOccurrence(issue!)).toBe("Marcação duplicada");
  });

  it("saída sem entrada (representável pela BD): Conflito + 'Sem entrada', independente da hora", () => {
    const shift = makeShift({ actualEndTime: "17:00" });
    const issue = computeAttendanceIssue(shift, NOW, NO_ISSUE);
    expect(issue?.state).toBe("CONFLITO");
    expect(describeAttendanceOccurrence(issue!)).toBe("Sem entrada");
  });

  it("ausência válida cobre o turno inteiro, ninguém apareceu: Regular (nunca 'Sem entrada' falso)", () => {
    const shift = makeShift();
    const afterEnd = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    const activeLeave: ActiveLeave = { employeeId: "e1", type: "vacation" };
    expect(computeAttendanceIssue(shift, afterEnd, { hasOverlap: false, activeLeave })).toBeNull();
  });

  it("presença registada apesar de ausência válida: Conflito + 'Presença durante ausência'", () => {
    const shift = makeShift({ actualStartTime: "09:00" });
    const activeLeave: ActiveLeave = { employeeId: "e1", type: "vacation" };
    const issue = computeAttendanceIssue(shift, NOW, { hasOverlap: false, activeLeave });
    expect(issue?.state).toBe("CONFLITO");
    expect(describeAttendanceOccurrence(issue!)).toBe("Presença durante ausência");
  });

  it("turno cancelado nunca gera pendência", () => {
    const shift = makeShift({ attendanceStatus: "cancelled" });
    const afterEnd = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    expect(computeAttendanceIssue(shift, afterEnd, NO_ISSUE)).toBeNull();
  });
});

describe("computeUnscheduledAttendanceIssue", () => {
  it("presença sem escala: sempre Conflito", () => {
    const row: UnscheduledAttendanceOccurrence = {
      attendanceId: "att-1",
      employeeId: "e1",
      workDate: WORK_DATE,
      locationId: "loc1",
      attendanceStatus: "worked_as_planned",
      actualStartTime: "10:00",
      actualEndTime: "18:00",
      lateMinutes: null,
    };
    const issue = computeUnscheduledAttendanceIssue(row);
    expect(issue.state).toBe("CONFLITO");
    expect(issue.shiftId).toBeNull();
    expect(describeAttendanceOccurrence(issue)).toBe("Presença sem escala");
  });
});
