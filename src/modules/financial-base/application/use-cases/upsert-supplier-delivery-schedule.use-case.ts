import { SupplierDeliverySchedule } from "../../domain/entities/supplier-delivery-schedule.js";
import type {
  SupplierDeliveryScheduleDTO,
  UpsertSupplierDeliveryScheduleCommand,
  UpsertSupplierDeliverySchedulePort,
} from "../../domain/ports/in/supplier-delivery-schedule.ports.js";
import type { SupplierDeliveryScheduleRepositoryPort } from "../../domain/ports/out/supplier-delivery-schedule-repository.port.js";
import { toScheduleDTO } from "./shared-supplier-delivery-schedule.js";

/** Cria ou atualiza o calendário de um par fornecedor×loja (uma linha cada, nunca duplicada). */
export class UpsertSupplierDeliveryScheduleUseCase implements UpsertSupplierDeliverySchedulePort {
  constructor(private readonly repository: SupplierDeliveryScheduleRepositoryPort) {}

  async execute(command: UpsertSupplierDeliveryScheduleCommand): Promise<SupplierDeliveryScheduleDTO> {
    const existing = await this.repository.findOne(command.organizationId, command.supplierId, command.locationId);

    const schedule = existing
      ? existing.update({
          weekdays: command.weekdays,
          cutoffTime: command.cutoffTime ?? null,
          ...(command.active !== undefined && { active: command.active }),
        })
      : SupplierDeliverySchedule.create({
          supplierId: command.supplierId,
          locationId: command.locationId,
          weekdays: command.weekdays,
          cutoffTime: command.cutoffTime ?? null,
          active: command.active ?? true,
        });

    await this.repository.upsert(command.organizationId, schedule);
    return toScheduleDTO(schedule);
  }
}
