import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AtCredentials, AtEnvironment } from "../../entities/at-communication.js";

export interface AtCredentialsSummary {
  legalEntityId: string;
  username: string;
  updatedAt: string;
}

/**
 * Subutilizador WFA (comunicação de faturas) de cada emitente, com a senha
 * cifrada em repouso. A senha só sai daqui para o envio à AT — nunca para a API.
 */
export interface AtCredentialsPort {
  list(org: OrganizationId, environment: AtEnvironment): Promise<AtCredentialsSummary[]>;
  /** Com a data da última gravação: credenciais recusadas só se repetem depois de serem regravadas. */
  get(org: OrganizationId, environment: AtEnvironment, legalEntityId: string): Promise<(AtCredentials & { updatedAt: string }) | null>;
  save(org: OrganizationId, environment: AtEnvironment, legalEntityId: string, credentials: AtCredentials, actor: string): Promise<void>;
  remove(org: OrganizationId, environment: AtEnvironment, legalEntityId: string): Promise<void>;
}
