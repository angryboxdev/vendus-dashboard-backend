import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface StockCountZoneDTO {
  id: string;
  locationId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CreateStockCountZoneData {
  locationId: string;
  name: string;
  sortOrder?: number;
}

/** Zonas — puramente organizacionais (secção 5/25/55); CRUD simples, sem hierarquia. */
export interface StockCountZonePort {
  listByLocation(organizationId: OrganizationId, locationId: string): Promise<StockCountZoneDTO[]>;
  create(organizationId: OrganizationId, data: CreateStockCountZoneData): Promise<StockCountZoneDTO>;
}
