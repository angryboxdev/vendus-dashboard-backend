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
