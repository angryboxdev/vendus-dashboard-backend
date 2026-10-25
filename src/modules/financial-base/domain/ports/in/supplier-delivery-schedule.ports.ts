import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { DeliveryDayRule } from "../../entities/supplier-delivery-schedule.js";

export type DeliveryDayRuleDTO = DeliveryDayRule;

export interface SupplierDeliveryScheduleDTO {
  id: string;
  supplierId: string;
  locationId: string;
  weekdays: number[] | null;
  cutoffTime: string | null;
  active: boolean;
  /** Por dia de entrega: até quando se encomenda e observação. */
  dayRules: DeliveryDayRuleDTO[];
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
  /** Ausente = mantém as regras atuais. */
  dayRules?: DeliveryDayRuleDTO[];
}

export interface UpsertSupplierDeliverySchedulePort {
  execute(command: UpsertSupplierDeliveryScheduleCommand): Promise<SupplierDeliveryScheduleDTO>;
}
