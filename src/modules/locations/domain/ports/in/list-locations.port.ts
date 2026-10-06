import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { LocationGeofence } from "../../entities/location.js";

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
  /** Zona de picagem do Portal do Colaborador. */
  geofence: LocationGeofence;
}

export interface ListLocationsInput {
  organizationId: OrganizationId;
}

/** Devolve ativos e inativos — cada consumidor filtra `isActive` conforme precisa (seletores de escrita só mostram ativos). */
export interface ListLocationsPort {
  execute(input: ListLocationsInput): Promise<LocationDto[]>;
}
