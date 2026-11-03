import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { IssuerSnapshot } from "../../entities/parties.js";

/** Dados do emitente (entidade legal) para gravar no documento — vem do módulo `legal-entities`, ligado no server.ts. */
export interface IssuerDirectoryPort {
  getIssuer(orgId: OrganizationId, legalEntityId: string): Promise<IssuerSnapshot | null>;
}
