import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { FiscalIdentity, FiscalKey, FiscalOrigin } from "../../entities/fiscal-identity.js";

export interface NewFiscalIdentity extends FiscalKey {
  legalEntityId: string | null;
  seriesNumber: string;
  numberDigits: string;
  atcud: string | null;
  firstOrigin: FiscalOrigin;
  invoiceId: string | null;
  stockImportId: string | null;
  createdBy: string;
}

/**
 * Identidades fiscais. A unicidade é garantida pela base de dados (índice
 * único na chave): pedidos simultâneos acabam todos na MESMA identidade.
 */
export interface FiscalIdentityRepositoryPort {
  findByKey(org: OrganizationId, key: FiscalKey): Promise<FiscalIdentity | null>;
  /** Insere se não existir; devolve a identidade que ficou (a nova ou a já existente) e se foi criada agora. */
  insertIfAbsent(org: OrganizationId, row: NewFiscalIdentity): Promise<{ identity: FiscalIdentity; created: boolean }>;
  /** Mesmo emitente/tipo e mesmos dígitos (formatações diferentes) — candidatos a comparar. */
  findSimilar(org: OrganizationId, key: FiscalKey, digits: string): Promise<FiscalIdentity[]>;
  findByInvoice(org: OrganizationId, invoiceId: string): Promise<FiscalIdentity | null>;
  findByStockImport(org: OrganizationId, stockImportId: string): Promise<FiscalIdentity | null>;
  /** Liga a identidade a uma fatura/importação (sem nunca substituir uma ligação existente). */
  link(org: OrganizationId, id: string, link: { invoiceId?: string; stockImportId?: string }): Promise<FiscalIdentity>;
  /** Corrige a chave (ex.: número mal lido); falha com DuplicateKey se a nova chave já existir. */
  rekey(org: OrganizationId, id: string, row: Pick<NewFiscalIdentity, keyof FiscalKey | "seriesNumber" | "numberDigits" | "atcud" | "legalEntityId">): Promise<FiscalIdentity>;
  /** Liberta a chave de uma fatura apagada que nunca chegou ao Stock. */
  removeForDeletedInvoice(org: OrganizationId, invoiceId: string): Promise<void>;
}

export class FiscalKeyTakenError extends Error {
  constructor(readonly existing: FiscalIdentity) {
    super("Já existe um documento com esta identidade fiscal.");
    this.name = "FiscalKeyTakenError";
  }
}

export interface FiscalAuditPort {
  record(org: OrganizationId, e: { actor: string; action: string; identityId: string; before: unknown; after: unknown; origin: FiscalOrigin | "backfill" }): Promise<void>;
}
