import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Invitation, JoinRequest } from "../../entities/invitation.js";

export interface InvitationsRepositoryPort {
  list(org: OrganizationId): Promise<Invitation[]>;
  get(org: OrganizationId, id: string): Promise<Invitation | null>;
  create(org: OrganizationId, i: { codeHash: string; codeHint: string; locationId: string | null; departmentId: string | null; maxUses: number | null; expiresAt: string }, by: string): Promise<Invitation>;
  revoke(org: OrganizationId, id: string, at: string): Promise<void>;
  /** +1 utilização só se ainda houver (atómico); devolve false se esgotou entretanto. */
  consumeUse(org: OrganizationId, id: string): Promise<boolean>;
  listRequests(org: OrganizationId): Promise<JoinRequest[]>;
  getRequest(org: OrganizationId, id: string): Promise<JoinRequest | null>;
  createRequest(org: OrganizationId, r: { invitationId: string; firstName: string; lastName: string; email: string; possibleDuplicate: boolean }): Promise<JoinRequest>;
  /** Só muda se o estado atual for o esperado (concorrência → false). */
  decide(org: OrganizationId, id: string, from: JoinRequest["status"], patch: Partial<Pick<JoinRequest, "status" | "rejectReason" | "decidedBy" | "decidedAt" | "employeeId">>): Promise<boolean>;
}

/** Códigos: gerar e calcular o hash (o domínio nunca vê o algoritmo). */
export interface InvitationCodesPort {
  generate(): string;
  hash(code: string): string;
}

/** A única procura sem organização: código → organização e convite. */
export interface InvitationLookupPort {
  findByCodeHash(codeHash: string): Promise<{ organizationId: OrganizationId; invitationId: string } | null>;
}

export interface InvitationsContextPort {
  /** Já existe uma ficha com este e-mail (RE-2)? Devolve o id, se existir. */
  employeeByEmail(org: OrganizationId, email: string): Promise<string | null>;
  now(): string;
  audit(org: OrganizationId, e: { actor: string; action: string; resourceId: string; after: unknown; reason?: string | null }): Promise<void>;
}
