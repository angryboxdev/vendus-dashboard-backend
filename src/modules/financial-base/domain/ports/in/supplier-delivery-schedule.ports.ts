import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface SupplierDeliveryScheduleDTO {
  id: string;
  supplierId: string;
  locationId: string;
  weekdays: number[] | null;
  cutoffTime: string | null;
  active: boolean;
}

// ── List (por fornecedor, todas as lojas) ────────────────────────────────────

export interface ListSupplierDeliverySchedulesCommand {
  organizationId: OrganizationId;
  supplierId: string;
}

/** Módulo Stock — Planeamento (D10): calendário de entrega por fornecedor×loja. */
export interface ListSupplierDeliverySchedulesPort {
  execute(command: ListSupplierDeliverySchedulesCommand): Promise<SupplierDeliveryScheduleDTO[]>;
}

// ── Upsert ────────────────────────────────────────────────────────────────

export interface UpsertSupplierDeliveryScheduleCommand {
  organizationId: OrganizationId;
  supplierId: string;
  locationId: string;
  weekdays: number[] | null;
  cutoffTime?: string | null;
  active?: boolean;
}

export interface UpsertSupplierDeliverySchedulePort {
  execute(command: UpsertSupplierDeliveryScheduleCommand): Promise<SupplierDeliveryScheduleDTO>;
}
