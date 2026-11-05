import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Dados da Empresa que fazem o emitente das faturas (entidade legal com o mesmo NIF). */
export interface CompanyIssuerData {
  legalName: string;
  country: "PT";
  nif: string;
  niss: string;
  email: string;
  street: string;
  postalCode: string;
  city: string;
  region: string;
  phone: string | null;
}

/** Resultado de sincronizar o emitente depois de gravar a Empresa (nunca impede a gravação). */
export type IssuerSyncResult =
  | { status: "synced" }
  /** Faltam campos (nomes dos campos da Empresa) — o emitente não foi criado/atualizado. */
  | { status: "incomplete"; missing: string[] }
  | { status: "failed"; message: string };

/** Cria ou atualiza a entidade legal da Empresa (módulo legal-entities, ligado no server.ts). */
export interface CompanyIssuerSyncPort {
  sync(organizationId: OrganizationId, actor: string, data: CompanyIssuerData): Promise<void>;
}
