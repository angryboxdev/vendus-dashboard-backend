import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { LocationChanges, LocationDetails, LocationGeofence } from "../../entities/location.js";
import type { LocationAuditLogRecordDTO } from "../out/location-audit-log.port.js";
import type { LocationDto } from "./list-locations.port.js";

export interface CreateLocationCommand {
  organizationId: OrganizationId;
  actor: string;
  details: LocationDetails;
}

export interface CreateLocationPort {
  execute(command: CreateLocationCommand): Promise<LocationDto>;
}

export interface UpdateLocationCommand {
  organizationId: OrganizationId;
  actor: string;
  locationId: string;
  changes: LocationChanges;
}

export interface UpdateLocationPort {
  execute(command: UpdateLocationCommand): Promise<LocationDto>;
}

export interface SetLocationActiveCommand {
  organizationId: OrganizationId;
  actor: string;
  locationId: string;
  active: boolean;
}

/** Ativar/inativar — nunca há hard delete de um Local. Idempotente: pedir o estado atual não grava nem audita. */
export interface SetLocationActivePort {
  execute(command: SetLocationActiveCommand): Promise<LocationDto>;
}

export interface SetLocationGeofenceCommand {
  organizationId: OrganizationId;
  actor: string;
  locationId: string;
  geofence: LocationGeofence;
}

/** Zona de picagem do Local (Portal do Colaborador) — auditada como alteração administrativa. */
export interface SetLocationGeofencePort {
  execute(command: SetLocationGeofenceCommand): Promise<LocationDto>;
}

export interface ListLocationHistoryQuery {
  organizationId: OrganizationId;
  locationId: string;
}

export interface ListLocationHistoryPort {
  execute(query: ListLocationHistoryQuery): Promise<LocationAuditLogRecordDTO[]>;
}
