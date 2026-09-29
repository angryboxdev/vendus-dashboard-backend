import type { BaseScheduleTemplate } from "../../domain/entities/base-schedule-template.js";
import type { BaseScheduleRepositoryPort } from "../../domain/ports/out/base-schedule-repository.port.js";
import type { BaseScheduleCellDTO, GetBaseScheduleCommand, GetBaseSchedulePort } from "../../domain/ports/in/schedule.ports.js";

export function toCellDTO(t: BaseScheduleTemplate): BaseScheduleCellDTO {
  return {
    id: t.id,
    employeeId: t.employeeId,
    weekday: t.weekday,
    isDayOff: t.isDayOff,
    startTime: t.startTime,
    endTime: t.endTime,
    locationId: t.locationId,
    breakMinutes: t.breakMinutes,
  };
}

export class GetBaseScheduleUseCase implements GetBaseSchedulePort {
  constructor(private readonly baseScheduleRepository: BaseScheduleRepositoryPort) {}

  async execute(command: GetBaseScheduleCommand): Promise<BaseScheduleCellDTO[]> {
    const cells = await this.baseScheduleRepository.findByEmployee(command.organizationId, command.employeeId);
    return cells.map(toCellDTO);
  }
}
