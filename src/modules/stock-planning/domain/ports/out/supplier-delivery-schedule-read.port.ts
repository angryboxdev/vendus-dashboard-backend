import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface SupplierDeliveryScheduleSnapshot {
  supplierId: string;
  locationId: string;
  /** ISO weekday, 1=Segunda … 7=Domingo; `null`/vazio = sem calendário configurado (secção 5 — nunca um compromisso). */
  weekdays: number[] | null;
  /** HH:mm, `null` = sem hora limite. */
  cutoffTime: string | null;
  active: boolean;
}

/** D10 → `financial-base` (`ListSupplierDeliverySchedulesPort`, novo nesta ronda). */
export interface SupplierDeliveryScheduleReadPort {
  findForSupplier(organizationId: OrganizationId, supplierId: string, locationId: string): Promise<SupplierDeliveryScheduleSnapshot | null>;
}
