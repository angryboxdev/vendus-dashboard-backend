import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { IssuerSnapshot } from "../../entities/parties.js";

/** Dados do emitente (entidade legal) para gravar no documento — vem do módulo `legal-entities`, ligado no server.ts. */
export interface IssuerDirectoryPort {
  /** Por omissão só entidades ativas (para emitir); `includeArchived` para obrigações sobre o passado (SAF-T). */
  getIssuer(orgId: OrganizationId, legalEntityId: string, opts?: { includeArchived?: boolean }): Promise<IssuerSnapshot | null>;
}
