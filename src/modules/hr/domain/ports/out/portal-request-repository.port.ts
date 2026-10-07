import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PortalRequest, PortalRequestKind } from "../../entities/portal-request.js";

/** `hr_portal_requests` — pedidos do Portal (ticket 12). */
export interface PortalRequestRepositoryPort {
  create(organizationId: OrganizationId, request: PortalRequest): Promise<PortalRequest>;
  update(organizationId: OrganizationId, request: PortalRequest): Promise<PortalRequest>;
  findById(organizationId: OrganizationId, id: string): Promise<PortalRequest | null>;
  /** Mais recentes primeiro. */
  findForEmployee(organizationId: OrganizationId, employeeId: string, limit: number): Promise<PortalRequest[]>;
  /** Pendentes dos tipos pedidos, mais antigos primeiro (Caixa de pedidos). */
  findPending(organizationId: OrganizationId, kinds: PortalRequestKind[]): Promise<PortalRequest[]>;
}
