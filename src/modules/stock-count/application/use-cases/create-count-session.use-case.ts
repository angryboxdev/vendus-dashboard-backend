import { StockCountSession } from "../../domain/entities/stock-count-session.js";
import { LocationRequiredError, NoActiveLocationError } from "../../domain/errors.js";
import type { CreateCountSessionCommand, CreateCountSessionPort, StockCountSessionDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import type { StockCountSettingsPort } from "../../domain/ports/out/stock-count-settings.port.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";
import type { StockCountAuditLogPort } from "../../domain/ports/out/stock-count-audit-log.port.js";
import { buildSessionDTO } from "./shared.js";

/** Rascunho: só define o escopo — nunca materializa linhas aqui (secção 12). */
export class CreateCountSessionUseCase implements CreateCountSessionPort {
  constructor(
    private readonly repository: StockCountRepositoryPort,
    private readonly settings: StockCountSettingsPort,
    private readonly locationRead: LocationReadPort,
    private readonly auditLog: StockCountAuditLogPort,
  ) {}

  async execute(command: CreateCountSessionCommand): Promise<StockCountSessionDTO> {
    let locationId = command.locationId ?? null;
    if (!locationId) {
      const activeLocations = await this.locationRead.listActive(command.organizationId);
      if (activeLocations.length === 0) throw new NoActiveLocationError();
      if (activeLocations.length > 1) throw new LocationRequiredError();
      locationId = activeLocations[0]!.id;
    }

    const companySettings = await this.settings.get(command.organizationId);

    const session = StockCountSession.create({
      organizationId: command.organizationId,
      locationId,
      type: command.type,
      scopeDefinition: command.scopeDefinition,
      blindCount: companySettings.blindCountDefault,
      businessDate: command.businessDate,
    });

    const inserted = await this.repository.insertSession(command.organizationId, session);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_count_session",
      entityId: inserted.id,
      action: "create",
      after: inserted.toProps(),
    });

    return buildSessionDTO(this.repository, command.organizationId, inserted, []);
  }
}
