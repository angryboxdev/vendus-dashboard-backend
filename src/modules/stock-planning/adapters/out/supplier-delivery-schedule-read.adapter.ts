import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ListSupplierDeliverySchedulesPort } from "../../../financial-base/domain/ports/in/supplier-delivery-schedule.ports.js";
import type {
  SupplierDeliveryScheduleReadPort,
  SupplierDeliveryScheduleSnapshot,
} from "../../domain/ports/out/supplier-delivery-schedule-read.port.js";

/** D10 — tradução fina sobre `financial-base`'s `ListSupplierDeliverySchedulesPort` (mesmo padrão de `FinancialBaseSupplierReadAdapter`). */
export class SupplierDeliveryScheduleReadAdapter implements SupplierDeliveryScheduleReadPort {
  constructor(private readonly listSupplierDeliverySchedules: ListSupplierDeliverySchedulesPort) {}

  async findForSupplier(organizationId: OrganizationId, supplierId: string, locationId: string): Promise<SupplierDeliveryScheduleSnapshot | null> {
    const schedules = await this.listSupplierDeliverySchedules.execute({ organizationId, supplierId });
    const match = schedules.find((s) => s.locationId === locationId);
    if (!match) return null;
    return {
      supplierId: match.supplierId,
      locationId: match.locationId,
      weekdays: match.weekdays,
      cutoffTime: match.cutoffTime,
      active: match.active,
    };
  }
}
