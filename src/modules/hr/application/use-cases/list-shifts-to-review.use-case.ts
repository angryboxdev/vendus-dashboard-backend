import { DateTime } from "luxon";
import { REPORT_TIMEZONE } from "../../../../utils/lisbonDayInstants.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { ShiftAttendanceReadPort } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import {
  assignReviewPriority,
  computeShiftExceptions,
  describeExceptionLabel,
  shiftNeedsReview,
} from "../../domain/services/overview-shift-state.service.js";
import type {
  ListShiftsToReviewCommand,
  ListShiftsToReviewPort,
  ListShiftsToReviewResultDTO,
  ReviewPriority,
  ShiftToReviewDTO,
} from "../../domain/ports/in/overview.ports.js";

/**
 * Janela de procura limitada — evita carregar todo o histórico só para
 * encontrar os turnos por conferir (RH-01 secção 12: "não carregar listas
 * completas para contar no browser"). Um turno com mais de 30 dias por
 * conferir é uma anomalia que já devia ter sido tratada de outra forma;
 * simplificação documentada.
 */
const REVIEW_LOOKBACK_DAYS = 30;

export class ListShiftsToReviewUseCase implements ListShiftsToReviewPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly shiftAttendanceRead: ShiftAttendanceReadPort,
    private readonly locationRepository: LocationRepositoryPort,
  ) {}

  async execute(command: ListShiftsToReviewCommand): Promise<ListShiftsToReviewResultDTO> {
    const now = DateTime.now().setZone(REPORT_TIMEZONE);
    const today = now.toISODate()!;
    const from = now.minus({ days: REVIEW_LOOKBACK_DAYS }).toISODate()!;

    const [employees, shifts, locations] = await Promise.all([
      this.employeeRepository.findMany(command.organizationId, { status: "all" }),
      this.shiftAttendanceRead.findShiftsInRange(command.organizationId, {
        from,
        to: today,
        ...(command.locationId && { locationId: command.locationId }),
      }),
      this.locationRepository.findAllForOrganization(command.organizationId),
    ]);
    const employeeNameById = new Map(employees.map((e) => [e.id, e.fullName]));
    const locationNameById = new Map(locations.map((l) => [l.id, l.name]));

    let items: Array<ShiftToReviewDTO & { occurredAtSort: string }> = shifts
      .filter((s) => shiftNeedsReview(s, now))
      .map((s) => {
        const exceptions = computeShiftExceptions(s, now);
        return {
          shiftId: s.shiftId,
          employeeId: s.employeeId,
          employeeName: employeeNameById.get(s.employeeId) ?? s.employeeId,
          workDate: s.workDate,
          plannedStartTime: s.startTime,
          plannedEndTime: s.endTime,
          actualStartTime: s.actualStartTime,
          actualEndTime: s.actualEndTime,
          exceptionLabel: describeExceptionLabel(exceptions, s.lateMinutes),
          priority: assignReviewPriority(s, exceptions, now),
          locationId: s.locationId,
          locationName: locationNameById.get(s.locationId) ?? null,
          occurredAtSort: `${s.workDate}T${s.startTime}`,
        };
      });

    const countsByPriority: Record<ReviewPriority, number> = { CRITICA: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 };
    for (const item of items) countsByPriority[item.priority]++;

    if (command.priority) items = items.filter((i) => i.priority === command.priority);
    if (command.search) {
      const q = command.search.toLowerCase();
      items = items.filter((i) => i.employeeName.toLowerCase().includes(q));
    }

    items.sort((a, b) => (a.occurredAtSort < b.occurredAtSort ? -1 : a.occurredAtSort > b.occurredAtSort ? 1 : 0));

    const total = items.length;
    const start = (command.page - 1) * command.pageSize;
    const page = items.slice(start, start + command.pageSize).map(({ occurredAtSort: _sort, ...rest }) => rest);

    return { items: page, total, page: command.page, pageSize: command.pageSize, countsByPriority };
  }
}
