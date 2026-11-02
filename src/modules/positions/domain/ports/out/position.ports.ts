import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Position } from "../../entities/position.js";

export interface PositionRepositoryPort {
  findAll(organizationId: OrganizationId): Promise<Position[]>;
  findById(organizationId: OrganizationId, id: string): Promise<Position | null>;
  /** Lança `DuplicatePositionNameError` se o nome normalizado já existir na organização. */
  insert(organizationId: OrganizationId, position: Position): Promise<void>;
  /** Lança `DuplicatePositionNameError` se o nome normalizado já existir na organização. */
  update(organizationId: OrganizationId, position: Position): Promise<void>;
}

/** Quem tem cada cargo (só o necessário para contar os colaboradores ativos). */
export interface PositionHoldersPort {
  list(organizationId: OrganizationId): Promise<{ positionId: string | null; active: boolean }[]>;
}

/** Auditoria dos cargos — continua em `hr_audit_logs` (o histórico já lá está). */
export interface PositionAuditPort {
  record(entry: {
    organizationId: OrganizationId;
    actor: string;
    positionId: string;
    action: "position_created" | "position_updated" | "position_activated" | "position_deactivated";
    description: string;
    before?: unknown;
    after?: unknown;
  }): Promise<void>;
}
