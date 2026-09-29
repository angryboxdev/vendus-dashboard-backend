import { ShiftRotationNotFoundError } from "../../domain/errors.js";
import { participantOnPatternA, participantOnPatternB } from "../../domain/entities/shift-rotation.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { ShiftRotationRepositoryPort } from "../../domain/ports/out/shift-rotation-repository.port.js";
import type {
  PreviewShiftRotationCommand,
  PreviewShiftRotationPort,
  RotationWeekPreviewDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { addDays, mondayOf } from "./schedule-shared.js";

const DEFAULT_PREVIEW_WEEKS = 2;

export class PreviewShiftRotationUseCase implements PreviewShiftRotationPort {
  constructor(
    private readonly shiftRotationRepository: ShiftRotationRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
  ) {}

  async execute(command: PreviewShiftRotationCommand): Promise<RotationWeekPreviewDTO[]> {
    const rotation = await this.shiftRotationRepository.findById(command.organizationId, command.rotationId);
    if (!rotation) throw new ShiftRotationNotFoundError(command.rotationId);

    const employees = await this.employeeRepository.findMany(command.organizationId, { status: "all" });
    const nameById = new Map(employees.map((e) => [e.id, e.fullName]));

    const weeks = Math.max(1, command.weeks ?? DEFAULT_PREVIEW_WEEKS);
    const startMonday = mondayOf(rotation.anchorDate);

    return Array.from({ length: weeks }, (_, i) => {
      const weekStartDate = addDays(startMonday, i * 7);
      const patternAEmployeeId = participantOnPatternA(rotation, weekStartDate);
      const patternBEmployeeId = participantOnPatternB(rotation, weekStartDate);
      return {
        weekStartDate,
        patternAEmployeeId,
        patternAEmployeeName: nameById.get(patternAEmployeeId) ?? patternAEmployeeId,
        patternBEmployeeId,
        patternBEmployeeName: nameById.get(patternBEmployeeId) ?? patternBEmployeeId,
        patternA: rotation.patternA,
        patternB: rotation.patternB,
      };
    });
  }
}
