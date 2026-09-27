import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { ListWorkShiftsCommand, ListWorkShiftsPort, WorkShiftDTO } from "../../domain/ports/in/schedule.ports.js";
import { toWorkShiftDTO } from "./schedule-shared.js";

export class ListWorkShiftsUseCase implements ListWorkShiftsPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
  ) {}

  async execute(command: ListWorkShiftsCommand): Promise<WorkShiftDTO[]> {
    const shifts = await this.workShiftRepository.findInRange(command.organizationId, {
      from: command.from,
      to: command.to,
      ...(command.employeeId !== undefined && { employeeId: command.employeeId }),
      ...(command.locationId !== undefined && { locationId: command.locationId }),
      ...(command.status !== undefined && { status: command.status }),
    });

    const employees = await this.employeeRepository.findMany(command.organizationId, { status: "all" });
    const nameById = new Map(employees.map((e) => [e.id, e.fullName]));

    const attendanceByShiftId = await this.workShiftRepository.findAttendanceStatusesByShiftIds(
      command.organizationId,
      shifts.map((s) => s.id),
    );

    return shifts.map((shift) =>
      toWorkShiftDTO(shift, nameById.get(shift.employeeId) ?? shift.employeeId, attendanceByShiftId.get(shift.id) ?? null),
    );
  }
}
