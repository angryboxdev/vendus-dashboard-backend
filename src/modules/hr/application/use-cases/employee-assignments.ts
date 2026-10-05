import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { Employee } from "../../domain/entities/employee.js";
import {
  InactivePositionError,
  InvalidEmployeeLocationError,
  PositionNotFoundError,
} from "../../domain/errors.js";
import type { PositionRepositoryPort } from "../../domain/ports/out/position-repository.port.js";

export interface AssignmentInput {
  positionId?: string | null;
  primaryLocationId?: string | null;
  authorizedLocationIds?: string[];
}

export interface ResolvedAssignments {
  positionId?: string | null;
  primaryLocationId?: string | null;
  authorizedLocationIds?: string[];
}

/**
 * Valida e resolve cargo + locais de um colaborador (Base Organizacional,
 * tickets 07/08). Regras:
 * - cargo tem de existir na organização; um cargo inativo nunca é
 *   atribuído de novo, mas quem já o tem mantém-no (gravar o colaborador
 *   sem mudar de cargo nunca falha por isso);
 * - locais têm de existir na organização; um local inativo só é aceite se
 *   o colaborador já o tinha (histórico preservado), nunca numa atribuição
 *   nova.
 * Campos `undefined` no input ficam como estão.
 */
export async function resolveEmployeeAssignments(
  positions: PositionRepositoryPort,
  locations: LocationRepositoryPort,
  organizationId: OrganizationId,
  input: AssignmentInput,
  current: Employee | null,
): Promise<ResolvedAssignments> {
  const resolved: ResolvedAssignments = {};

  if (input.positionId !== undefined) {
    resolved.positionId = input.positionId;
    if (input.positionId !== null) {
      const position = await positions.findById(organizationId, input.positionId);
      if (!position) throw new PositionNotFoundError(input.positionId);
      if (!position.active && current?.positionId !== position.id) throw new InactivePositionError(position.name);
    }
  }

  const touchesLocations = input.primaryLocationId !== undefined || input.authorizedLocationIds !== undefined;
  if (!touchesLocations) return resolved;

  const alreadyAssigned = new Set<string>([
    ...(current?.primaryLocationId ? [current.primaryLocationId] : []),
    ...(current?.authorizedLocationIds ?? []),
  ]);
  const requested = [
    ...(input.primaryLocationId ? [input.primaryLocationId] : []),
    ...(input.authorizedLocationIds ?? []),
  ];
  if (requested.length > 0) {
    const byId = new Map((await locations.findAllForOrganization(organizationId)).map((l) => [l.id, l]));
    for (const id of requested) {
      const location = byId.get(id);
      if (!location) throw new InvalidEmployeeLocationError(`Local não encontrado: ${id}`);
      if (!location.isActive && !alreadyAssigned.has(id)) {
        throw new InvalidEmployeeLocationError(`O local "${location.name}" está inativo e não pode ser atribuído`);
      }
    }
  }

  if (input.primaryLocationId !== undefined) resolved.primaryLocationId = input.primaryLocationId;
  if (input.authorizedLocationIds !== undefined) resolved.authorizedLocationIds = input.authorizedLocationIds;
  return resolved;
}
