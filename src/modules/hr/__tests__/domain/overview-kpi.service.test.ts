import { DateTime } from "luxon";
import { computeTodayOperationKpis, computeConflictEmployeeIds } from "../../domain/services/overview-kpi.service.js";
import type { ShiftOccurrence } from "../../domain/ports/out/shift-attendance-read.port.js";

const WORK_DATE = "2026-09-26";
const NOW = DateTime.fromISO(`${WORK_DATE}T12:00:00`, { zone: "Europe/Lisbon" });

function makeShift(overrides: Partial<ShiftOccurrence> = {}): ShiftOccurrence {
  return {
    shiftId: "s1",
    employeeId: "e1",
    workDate: WORK_DATE,
    startTime: "09:00",
    endTime: "17:00",
    locationId: "loc1",
    attendanceStatus: null,
    actualStartTime: null,
    actualEndTime: null,
    lateMinutes: null,
    ...overrides,
  };
}

describe("computeTodayOperationKpis", () => {
  it("2 turnos do mesmo colaborador contam 1 em escalados/presentes", () => {
    const shifts = [
      makeShift({ shiftId: "s1", employeeId: "e1", startTime: "09:00", endTime: "13:00", actualStartTime: "09:00" }),
      makeShift({ shiftId: "s2", employeeId: "e1", startTime: "14:00", endTime: "18:00" }),
    ];
    const kpis = computeTodayOperationKpis(shifts, new Set(), NOW);
    expect(kpis.scheduledCount).toBe(1);
    expect(kpis.presentCount).toBe(1);
  });

  it("turno cancelado não conta para escalados", () => {
    const shifts = [makeShift({ attendanceStatus: "cancelled" })];
    const kpis = computeTodayOperationKpis(shifts, new Set(), NOW);
    expect(kpis.scheduledCount).toBe(0);
  });

  it("ausente operacional só conta se não houver férias/baixa/folga a cobrir o dia", () => {
    const now = DateTime.fromISO(`${WORK_DATE}T18:00:00`, { zone: "Europe/Lisbon" });
    const shifts = [makeShift({ employeeId: "e1" }), makeShift({ shiftId: "s2", employeeId: "e2" })];
    const withoutLeave = computeTodayOperationKpis(shifts, new Set(), now);
    expect(withoutLeave.absentCount).toBe(2);

    const withLeaveForE1 = computeTodayOperationKpis(shifts, new Set(["e1"]), now);
    expect(withLeaveForE1.absentCount).toBe(1);
  });

  it("atraso conta mesmo coexistindo com presente (chegou atrasado mas já está presente)", () => {
    const shifts = [makeShift({ attendanceStatus: "late", actualStartTime: "09:20", lateMinutes: 20 })];
    const kpis = computeTodayOperationKpis(shifts, new Set(), NOW);
    expect(kpis.presentCount).toBe(1);
    expect(kpis.lateCount).toBe(1);
  });
});

describe("computeConflictEmployeeIds", () => {
  it("identifica colaborador com duas presenças abertas em simultâneo", () => {
    const shifts = [
      makeShift({ shiftId: "s1", employeeId: "e1", actualStartTime: "09:00" }),
      makeShift({ shiftId: "s2", employeeId: "e1", startTime: "10:00", endTime: "18:00", actualStartTime: "10:00" }),
      makeShift({ shiftId: "s3", employeeId: "e2", actualStartTime: "09:00" }),
    ];
    expect(computeConflictEmployeeIds(shifts, NOW)).toEqual(["e1"]);
  });
});
