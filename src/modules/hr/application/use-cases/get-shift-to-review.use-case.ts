import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { ShiftAttendanceReadPort } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import { assignReviewPriority, computeShiftExceptions, describeExceptionLabel, shiftNeedsReview } from "../../domain/services/overview-shift-state.service.js";
import type { GetShiftToReviewCommand, GetShiftToReviewPort, ShiftToReviewDTO } from "../../domain/ports/in/overview.ports.js";

const REVIEW_LOOKBACK_DAYS = 30;

/**
 * Busca 1 turno "por conferir" pelo id — usado pelo drill-down direto da
 * Visão Geral ("Hoje na operação"), que precisa de abrir a conferência sem
 * primeiro carregar a lista paginada inteira (`ListShiftsToReviewUseCase`).
 * Devolve `null` também quando o turno já não precisa de conferência (ex:
 * foi confirmado entretanto por outra aba) — nunca lança erro nesse caso,
 * o chamador trata como "já não há nada para conferir aqui".
 */
export class GetShiftToReviewUseCase implements GetShiftToReviewPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly shiftAttendanceRead: ShiftAttendanceReadPort,
    private readonly locationRepository: LocationRepositoryPort,
  ) {}

  async execute(command: GetShiftToReviewCommand): Promise<ShiftToReviewDTO | null> {
    const now = DateTime.now().setZone(REPORT_TIMEZONE);
    const today = now.toISODate()!;
    const from = now.minus({ days: REVIEW_LOOKBACK_DAYS }).toISODate()!;

    const shifts = await this.shiftAttendanceRead.findShiftsInRange(command.organizationId, { from, to: today });
    const shift = shifts.find((s) => s.shiftId === command.shiftId);
    if (!shift || !shiftNeedsReview(shift, now)) return null;

    const [employee, locations] = await Promise.all([
      this.employeeRepository.findById(command.organizationId, shift.employeeId),
      this.locationRepository.findAllForOrganization(command.organizationId),
    ]);
    const locationNameById = new Map(locations.map((l) => [l.id, l.name]));
    const exceptions = computeShiftExceptions(shift, now);

    return {
      shiftId: shift.shiftId,
      employeeId: shift.employeeId,
      employeeName: employee?.fullName ?? shift.employeeId,
      workDate: shift.workDate,
      plannedStartTime: shift.startTime,
      plannedEndTime: shift.endTime,
      actualStartTime: shift.actualStartTime,
      actualEndTime: shift.actualEndTime,
      exceptionLabel: describeExceptionLabel(exceptions, shift.lateMinutes),
      priority: assignReviewPriority(shift, exceptions, now),
      locationId: shift.locationId,
      locationName: locationNameById.get(shift.locationId) ?? null,
    };
  }
}
