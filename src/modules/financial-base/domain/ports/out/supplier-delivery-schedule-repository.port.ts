import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { SupplierDeliverySchedule } from "../../entities/supplier-delivery-schedule.js";

export interface SupplierDeliveryScheduleRepositoryPort {
  findAllForSupplier(organizationId: OrganizationId, supplierId: string): Promise<SupplierDeliverySchedule[]>;
  findOne(organizationId: OrganizationId, supplierId: string, locationId: string): Promise<SupplierDeliverySchedule | null>;
  upsert(organizationId: OrganizationId, schedule: SupplierDeliverySchedule): Promise<void>;
}
