import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { SupplierDeliverySchedule } from "../../domain/entities/supplier-delivery-schedule.js";
import type { SupplierDeliveryScheduleRepositoryPort } from "../../domain/ports/out/supplier-delivery-schedule-repository.port.js";

export class FakeSupplierDeliveryScheduleRepository implements SupplierDeliveryScheduleRepositoryPort {
  schedules = new Map<string, SupplierDeliverySchedule>();

  async findAllForSupplier(_organizationId: OrganizationId, supplierId: string): Promise<SupplierDeliverySchedule[]> {
    return [...this.schedules.values()].filter((s) => s.supplierId === supplierId);
  }

  async findOne(_organizationId: OrganizationId, supplierId: string, locationId: string): Promise<SupplierDeliverySchedule | null> {
    return [...this.schedules.values()].find((s) => s.supplierId === supplierId && s.locationId === locationId) ?? null;
  }

  async upsert(_organizationId: OrganizationId, schedule: SupplierDeliverySchedule): Promise<void> {
    this.schedules.set(schedule.id, schedule);
  }
}
