import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { BaseScheduleRepositoryPort } from "../../domain/ports/out/base-schedule-repository.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import { detectOverlaps, detectMissingCoverage, countPendingPublish } from "../../domain/services/schedule-alerts.service.js";
import type { GetScheduleAlertsCommand, GetScheduleAlertsPort, ScheduleAlertsDTO } from "../../domain/ports/in/schedule.ports.js";
import { weekdayOf } from "./schedule-shared.js";

export class GetScheduleAlertsUseCase implements GetScheduleAlertsPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly baseScheduleRepository: BaseScheduleRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly holidayRead: HolidayReadPort,
  ) {}

  async execute(command: GetScheduleAlertsCommand): Promise<ScheduleAlertsDTO> {
    const filter = {
      from: command.from,
      to: command.to,
      ...(command.locationId !== undefined && { locationId: command.locationId }),
    };

    const [shifts, templates, leaves, holidays, employees] = await Promise.all([
      this.workShiftRepository.findInRange(command.organizationId, filter),
      this.baseScheduleRepository.findAll(command.organizationId),
      this.leaveRead.findActiveInRange(command.organizationId, command.from, command.to),
      this.holidayRead.findInRange(command.organizationId, command.from, command.to),
      this.employeeRepository.findMany(command.organizationId, { status: "all" }),
    ]);
    const nameById = new Map(employees.map((e) => [e.id, e.fullName]));

    const templatesByEmployee = new Map<string, typeof templates>();
    for (const t of templates) {
      const list = templatesByEmployee.get(t.employeeId) ?? [];
      list.push(t);
      templatesByEmployee.set(t.employeeId, list);
    }

    const weekDates: string[] = [];
    for (let d = new Date(command.from + "T00:00:00Z"); d <= new Date(command.to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
      weekDates.push(d.toISOString().slice(0, 10));
    }

    const employeeIdsOnLeaveByDate = new Map<string, Set<string>>();
    for (const date of weekDates) {
      const ids = new Set(leaves.filter((l) => l.startDate <= date && l.endDate >= date).map((l) => l.employeeId));
      employeeIdsOnLeaveByDate.set(date, ids);
    }
    const holidayDates = new Set(holidays.map((h) => h.date));

    const overlaps = detectOverlaps(shifts);
    const coverageGaps = detectMissingCoverage({
      templatesByEmployee,
      shifts,
      weekDates,
      weekdayOf,
      employeeIdsOnLeaveByDate,
      holidayDates,
    });

    return {
      coverageGaps: coverageGaps.map((g) => ({
        employeeId: g.employeeId,
        employeeName: nameById.get(g.employeeId) ?? g.employeeId,
        workDate: g.workDate,
        locationId: g.locationId,
      })),
      overlaps: overlaps.map((o) => ({
        employeeId: o.employeeId,
        employeeName: nameById.get(o.employeeId) ?? o.employeeId,
        workDate: o.workDate,
        shiftIds: o.shiftIds,
      })),
      pendingPublishCount: countPendingPublish(shifts),
      pendingPublishRange: shifts.some((s) => s.status === "draft") ? { from: command.from, to: command.to } : null,
    };
  }
}
