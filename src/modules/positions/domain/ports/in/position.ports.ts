import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface PositionDTO {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  /** Colaboradores ativos com este cargo. */
  employeeCount: number;
  updatedAt: string;
}

export interface ListPositionsPort {
  execute(organizationId: OrganizationId): Promise<PositionDTO[]>;
}

export interface CreatePositionCommand {
  organizationId: OrganizationId;
  actor: string;
  name: string;
  description: string | null;
}

export interface CreatePositionPort {
  execute(command: CreatePositionCommand): Promise<PositionDTO>;
}

export interface UpdatePositionCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  name?: string;
  description?: string | null;
}

export interface UpdatePositionPort {
  execute(command: UpdatePositionCommand): Promise<PositionDTO>;
}

export interface SetPositionActiveCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  active: boolean;
}

/** Ativar/inativar — nunca há hard delete; quem já tem o cargo mantém-no. */
export interface SetPositionActivePort {
  execute(command: SetPositionActiveCommand): Promise<PositionDTO>;
}
