import { Location } from "../../domain/entities/location.js";
import type { LocationDto } from "../../domain/ports/in/list-locations.port.js";
import type {
  CreateLocationCommand,
  CreateLocationPort,
  ListLocationHistoryPort,
  ListLocationHistoryQuery,
  SetLocationActiveCommand,
  SetLocationActivePort,
  SetLocationGeofenceCommand,
  SetLocationGeofencePort,
  UpdateLocationCommand,
  UpdateLocationPort,
} from "../../domain/ports/in/manage-locations.port.js";
import type { LocationAuditLogPort, LocationAuditLogRecordDTO } from "../../domain/ports/out/location-audit-log.port.js";
import type { LocationRepositoryPort } from "../../domain/ports/out/location-repository.port.js";
import { assertCodeAvailable, loadLocationOrThrow, toLocationDto } from "./shared.js";

type Clock = () => Date;
type IdGenerator = () => string;

const systemClock: Clock = () => new Date();
const randomId: IdGenerator = () => crypto.randomUUID();

export class CreateLocationUseCase implements CreateLocationPort {
  constructor(
    private readonly repository: LocationRepositoryPort,
    private readonly auditLog: LocationAuditLogPort,
    private readonly now: Clock = systemClock,
    private readonly newId: IdGenerator = randomId,
  ) {}

  async execute(command: CreateLocationCommand): Promise<LocationDto> {
    const location = Location.create(this.newId(), command.details, this.now());
    await assertCodeAvailable(this.repository, command.organizationId, location);
    await this.repository.insert(command.organizationId, location);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "location",
      entityId: location.id,
      action: "create",
      after: location.toProps(),
    });
    return toLocationDto(location);
  }
}

export class UpdateLocationUseCase implements UpdateLocationPort {
  constructor(
    private readonly repository: LocationRepositoryPort,
    private readonly auditLog: LocationAuditLogPort,
    private readonly now: Clock = systemClock,
  ) {}

  async execute(command: UpdateLocationCommand): Promise<LocationDto> {
    const current = await loadLocationOrThrow(this.repository, command.organizationId, command.locationId);
    const updated = current.update(command.changes, this.now());
    await assertCodeAvailable(this.repository, command.organizationId, updated);
    await this.repository.update(command.organizationId, updated);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "location",
      entityId: current.id,
      action: "update",
      before: current.toProps(),
      after: updated.toProps(),
    });
    return toLocationDto(updated);
  }
}

export class SetLocationActiveUseCase implements SetLocationActivePort {
  constructor(
    private readonly repository: LocationRepositoryPort,
    private readonly auditLog: LocationAuditLogPort,
    private readonly now: Clock = systemClock,
  ) {}

  async execute(command: SetLocationActiveCommand): Promise<LocationDto> {
    const current = await loadLocationOrThrow(this.repository, command.organizationId, command.locationId);
    if (current.isActive === command.active) return toLocationDto(current);

    const updated = command.active ? current.activate(this.now()) : current.deactivate(this.now());
    await this.repository.update(command.organizationId, updated);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "location",
      entityId: current.id,
      action: command.active ? "activate" : "deactivate",
      before: { isActive: current.isActive },
      after: { isActive: updated.isActive },
    });
    return toLocationDto(updated);
  }
}

export class SetLocationGeofenceUseCase implements SetLocationGeofencePort {
  constructor(
    private readonly repository: LocationRepositoryPort,
    private readonly auditLog: LocationAuditLogPort,
    private readonly now: Clock = systemClock,
  ) {}

  async execute(command: SetLocationGeofenceCommand): Promise<LocationDto> {
    const current = await loadLocationOrThrow(this.repository, command.organizationId, command.locationId);
    const updated = current.setGeofence(command.geofence, this.now());
    await this.repository.update(command.organizationId, updated);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "location",
      entityId: current.id,
      action: "geofence",
      before: current.geofence,
      after: updated.geofence,
    });
    return toLocationDto(updated);
  }
}

export class ListLocationHistoryUseCase implements ListLocationHistoryPort {
  constructor(
    private readonly repository: LocationRepositoryPort,
    private readonly auditLog: LocationAuditLogPort,
  ) {}

  /** Confirma a posse antes de ler — um id de outra organização dá 404, nunca uma lista vazia ambígua. */
  async execute(query: ListLocationHistoryQuery): Promise<LocationAuditLogRecordDTO[]> {
    await loadLocationOrThrow(this.repository, query.organizationId, query.locationId);
    return this.auditLog.findByEntityId(query.organizationId, query.locationId);
  }
}
