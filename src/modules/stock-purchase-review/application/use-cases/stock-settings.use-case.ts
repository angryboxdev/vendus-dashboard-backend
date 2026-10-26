import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvalidStockSettingsError } from "../../domain/errors.js";
import type { SaveStockSettingsCommand, StockSettingsDTO, StockSettingsPort } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";
import type { StockSettingsRepositoryPort } from "../../domain/ports/out/stock-settings-repository.port.js";

/**
 * Localização principal do Stock (task V5 §2.4): para onde vão as entradas das faturas sem perguntar
 * o destino. Só lojas ativas da empresa; alterações auditadas.
 */
export class StockSettingsUseCase implements StockSettingsPort {
  constructor(
    private readonly repository: StockSettingsRepositoryPort,
    private readonly locations: LocationReadPort,
    private readonly auditLog: StockReviewAuditLogPort,
  ) {}

  async get(organizationId: OrganizationId): Promise<StockSettingsDTO> {
    const [defaultLocationId, active] = await Promise.all([this.repository.getDefaultLocationId(organizationId), this.locations.listActive(organizationId)]);
    return {
      defaultLocationId: defaultLocationId && active.some((l) => l.id === defaultLocationId) ? defaultLocationId : null,
      locations: active.map((l) => ({ id: l.id, name: l.name })),
    };
  }

  async save(command: SaveStockSettingsCommand): Promise<StockSettingsDTO> {
    const active = await this.locations.listActive(command.organizationId);
    if (command.defaultLocationId !== null && !active.some((l) => l.id === command.defaultLocationId)) {
      throw new InvalidStockSettingsError("a localização principal tem de ser uma loja ativa da empresa");
    }
    const before = await this.get(command.organizationId);
    await this.repository.setDefaultLocationId(command.organizationId, command.defaultLocationId, command.actor);
    const after = await this.get(command.organizationId);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_settings",
      entityId: command.organizationId,
      action: "default_location_changed",
      before: { defaultLocationId: before.defaultLocationId },
      after: { defaultLocationId: after.defaultLocationId },
    });
    return after;
  }
}

/**
 * Loja das entradas sem loja própria: a indicada, a única loja ativa, ou a localização principal
 * (se ainda ativa). Com várias lojas e sem principal → `null` (a confirmação recusa; nunca ao acaso).
 */
export function resolveEntryLocation(explicit: string | null, active: { id: string }[], defaultLocationId: string | null): string | null {
  if (explicit) return explicit;
  if (active.length === 1) return active[0]!.id;
  if (defaultLocationId && active.some((l) => l.id === defaultLocationId)) return defaultLocationId;
  return null;
}
