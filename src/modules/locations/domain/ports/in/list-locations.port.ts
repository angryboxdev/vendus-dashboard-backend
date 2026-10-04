import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface LocationDto {
  id: string;
  name: string;
  /** Opcional desde a Base Organizacional (ticket 02). */
  code: string | null;
  timezone: string;
  isActive: boolean;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  municipality: string | null;
  country: string;
  phone: string | null;
}

export interface ListLocationsInput {
  organizationId: OrganizationId;
}

/** Devolve ativos e inativos — cada consumidor filtra `isActive` conforme precisa (seletores de escrita só mostram ativos). */
export interface ListLocationsPort {
  execute(input: ListLocationsInput): Promise<LocationDto[]>;
}
