import type { WorkShift } from "../../domain/entities/work-shift.js";
import type { ShiftRotation } from "../../domain/entities/shift-rotation.js";
import type { ShiftAttendanceStatusValue } from "../../domain/ports/out/work-shift-repository.port.js";
import type { WorkShiftDTO, ShiftRotationDTO } from "../../domain/ports/in/schedule.ports.js";

export function toWorkShiftDTO(
  shift: WorkShift,
  employeeName: string,
  attendanceStatus: ShiftAttendanceStatusValue | null,
): WorkShiftDTO {
  return {
    id: shift.id,
    employeeId: shift.employeeId,
    employeeName,
    workDate: shift.workDate,
    startTime: shift.startTime,
    endTime: shift.endTime,
    endsNextDay: shift.endsNextDay,
    secondStartTime: shift.secondStartTime,
    secondEndTime: shift.secondEndTime,
    locationId: shift.locationId,
    breakMinutes: shift.breakMinutes,
    notes: shift.notes,
    status: shift.status,
    source: shift.source,
    rotationId: shift.rotationId,
    seriesId: shift.seriesId,
    attendanceStatus,
    createdAt: shift.createdAt,
    updatedAt: shift.updatedAt,
  };
}

export function toShiftRotationDTO(
  rotation: ShiftRotation,
  employeeNameById: ReadonlyMap<string, string>,
): ShiftRotationDTO {
  return {
    id: rotation.id,
    jobRole: rotation.jobRole,
    participantEmployeeIds: rotation.participantEmployeeIds,
    participantNames: [
      employeeNameById.get(rotation.participantEmployeeIds[0]) ?? rotation.participantEmployeeIds[0],
      employeeNameById.get(rotation.participantEmployeeIds[1]) ?? rotation.participantEmployeeIds[1],
    ],
    patternA: rotation.patternA,
    patternB: rotation.patternB,
    locationId: rotation.locationId,
    anchorDate: rotation.anchorDate,
    autoSwitchWeekly: rotation.autoSwitchWeekly,
    active: rotation.active,
  };
}

/** Segunda-feira (YYYY-MM-DD) da semana que contém `dateYmd`. */
export function mondayOf(dateYmd: string): string {
  const d = new Date(dateYmd + "T00:00:00Z");
  const isoWeekday = (d.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  d.setUTCDate(d.getUTCDate() - isoWeekday);
  return d.toISOString().slice(0, 10);
}

/** As 7 datas (YYYY-MM-DD) da semana que começa em `weekStartDate` (segunda-feira). */
export function weekDatesFrom(weekStartDate: string): string[] {
  const start = new Date(weekStartDate + "T00:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** 0=Segunda..6=Domingo para uma data YYYY-MM-DD (mesma convenção da escala base). */
export function weekdayOf(dateYmd: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const d = new Date(dateYmd + "T00:00:00Z");
  return ((d.getUTCDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function addDays(dateYmd: string, days: number): string {
  const d = new Date(dateYmd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
