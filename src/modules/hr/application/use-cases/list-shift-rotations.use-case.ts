import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { ShiftRotationRepositoryPort } from "../../domain/ports/out/shift-rotation-repository.port.js";
import type {
  ListShiftRotationsCommand,
  ListShiftRotationsPort,
  ShiftRotationDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { toShiftRotationDTO } from "./schedule-shared.js";

export class ListShiftRotationsUseCase implements ListShiftRotationsPort {
  constructor(
    private readonly shiftRotationRepository: ShiftRotationRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
  ) {}

  async execute(command: ListShiftRotationsCommand): Promise<ShiftRotationDTO[]> {
    const rotations = await this.shiftRotationRepository.findAll(command.organizationId);
    const employees = await this.employeeRepository.findMany(command.organizationId, { status: "all" });
    const nameById = new Map(employees.map((e) => [e.id, e.fullName]));
    return rotations.map((r) => toShiftRotationDTO(r, nameById));
  }
}
