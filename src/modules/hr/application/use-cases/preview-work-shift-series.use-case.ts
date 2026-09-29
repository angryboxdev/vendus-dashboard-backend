import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import type {
  PreviewWorkShiftSeriesCommand,
  PreviewWorkShiftSeriesPort,
  PreviewWorkShiftSeriesResultDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { computeSeriesPartition, toPlannedOccurrenceDTO } from "./shift-series-shared.js";

export class PreviewWorkShiftSeriesUseCase implements PreviewWorkShiftSeriesPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly holidayRead: HolidayReadPort,
  ) {}

  async execute(command: PreviewWorkShiftSeriesCommand): Promise<PreviewWorkShiftSeriesResultDTO> {
    const { toCreate, conflicts, skipped } = await computeSeriesPartition({
      organizationId: command.organizationId,
      employeeId: command.employeeId,
      startDate: command.startDate,
      rules: command.rules,
      repeat: command.repeat,
      workShiftRepository: this.workShiftRepository,
      leaveRead: this.leaveRead,
      holidayRead: this.holidayRead,
    });

    const occurrences = [
      ...toCreate.map((o) => toPlannedOccurrenceDTO(o, "available" as const)),
      ...conflicts.map((o) => toPlannedOccurrenceDTO(o, "conflict" as const)),
      ...skipped.map((o) => toPlannedOccurrenceDTO(o, o.reason === "leave" ? ("skipped_leave" as const) : ("skipped_holiday" as const))),
    ].sort((a, b) => a.workDate.localeCompare(b.workDate));

    return {
      occurrences,
      availableCount: toCreate.length,
      conflictCount: conflicts.length,
      skippedCount: skipped.length,
    };
  }
}
