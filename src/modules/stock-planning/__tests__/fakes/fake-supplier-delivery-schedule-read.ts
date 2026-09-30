import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { SupplierDeliveryScheduleReadPort, SupplierDeliveryScheduleSnapshot } from "../../domain/ports/out/supplier-delivery-schedule-read.port.js";

export class FakeSupplierDeliveryScheduleRead implements SupplierDeliveryScheduleReadPort {
  schedules: SupplierDeliveryScheduleSnapshot[] = [];

  async findForSupplier(_organizationId: OrganizationId, supplierId: string, locationId: string): Promise<SupplierDeliveryScheduleSnapshot | null> {
    return this.schedules.find((s) => s.supplierId === supplierId && s.locationId === locationId) ?? null;
  }
}
