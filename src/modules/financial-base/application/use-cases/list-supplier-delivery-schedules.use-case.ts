import type {
  ListSupplierDeliverySchedulesCommand,
  ListSupplierDeliverySchedulesPort,
  SupplierDeliveryScheduleDTO,
} from "../../domain/ports/in/supplier-delivery-schedule.ports.js";
import type { SupplierDeliveryScheduleRepositoryPort } from "../../domain/ports/out/supplier-delivery-schedule-repository.port.js";
import { toScheduleDTO } from "./shared-supplier-delivery-schedule.js";

export class ListSupplierDeliverySchedulesUseCase implements ListSupplierDeliverySchedulesPort {
  constructor(private readonly repository: SupplierDeliveryScheduleRepositoryPort) {}

  async execute(command: ListSupplierDeliverySchedulesCommand): Promise<SupplierDeliveryScheduleDTO[]> {
    const schedules = await this.repository.findAllForSupplier(command.organizationId, command.supplierId);
    return schedules.map(toScheduleDTO);
  }
}
