import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import type {
  PreviewRepeatCalendarWeekCommand,
  PreviewRepeatCalendarWeekPort,
  PreviewRepeatCalendarWeekResultDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { computeRepeatWeekPartitions, repeatWeekTargetStartDate, toRepeatWeekEmployeeDTOs } from "./repeat-calendar-week-shared.js";

/**
 * "Repetir escala pelo calendário" — pré-visualização. Usa exatamente o
 * mesmo `computeRepeatWeekPartitions` que `RepeatCalendarWeekUseCase`
 * (criação), garantindo que o que se mostra é o que se vai gravar.
 */
export class PreviewRepeatCalendarWeekUseCase implements PreviewRepeatCalendarWeekPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly holidayRead: HolidayReadPort,
  ) {}

  async execute(command: PreviewRepeatCalendarWeekCommand): Promise<PreviewRepeatCalendarWeekResultDTO> {
    const employees = await this.employeeRepository.findMany(command.organizationId, { status: "all" });
    const employeeNameById = new Map(employees.map((e) => [e.id, e.fullName]));

    const groups = await computeRepeatWeekPartitions({
      organizationId: command.organizationId,
      sourceWeekStartDate: command.sourceWeekStartDate,
      weekdays: command.weekdays,
      employeeIds: command.employeeIds,
      ...(command.rotateEmployees && { rotateEmployees: true }),
      repeat: command.repeat,
      workShiftRepository: this.workShiftRepository,
      leaveRead: this.leaveRead,
      holidayRead: this.holidayRead,
    });

    const employeeDTOs = toRepeatWeekEmployeeDTOs(groups, employeeNameById).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    const targetStartDate = repeatWeekTargetStartDate(command.sourceWeekStartDate);

    return {
      targetStartDate,
      targetEndDate: employeeDTOs
        .flatMap((e) => e.locations.flatMap((l) => l.occurrences.map((o) => o.workDate)))
        .reduce((max, d) => (d > max ? d : max), targetStartDate),
      employees: employeeDTOs,
      totalAvailable: employeeDTOs.reduce((sum, e) => sum + e.availableCount, 0),
      totalConflicts: employeeDTOs.reduce((sum, e) => sum + e.conflictCount, 0),
      totalSkipped: employeeDTOs.reduce((sum, e) => sum + e.skippedCount, 0),
    };
  }
}
