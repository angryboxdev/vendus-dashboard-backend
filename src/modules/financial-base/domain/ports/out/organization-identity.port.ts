import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { OrganizationIdentity } from "../../entities/organization-identity.js";

/**
 * A tabela `organizations` está registada no `TABLE_REGISTRY` com a sua
 * própria chave primária como coluna de organização, pelo que escopar por
 * `organizationId` já selecciona exactamente a linha do próprio chamador —
 * não há um id separado a passar.
 */
export interface OrganizationIdentityPort {
  findById(organizationId: OrganizationId): Promise<OrganizationIdentity | null>;
}
