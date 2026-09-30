import type { SupplierDeliverySchedule } from "../../domain/entities/supplier-delivery-schedule.js";
import type { SupplierDeliveryScheduleDTO } from "../../domain/ports/in/supplier-delivery-schedule.ports.js";

export function toScheduleDTO(schedule: SupplierDeliverySchedule): SupplierDeliveryScheduleDTO {
  const p = schedule.toProps();
  return {
    id: p.id,
    supplierId: p.supplierId,
    locationId: p.locationId,
    weekdays: p.weekdays,
    cutoffTime: p.cutoffTime,
    active: p.active,
  };
}
