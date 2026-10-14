import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { BackfillReport, ClaimOptions, ClaimResult, FiscalIdentityInput, HistoricalDocument, IdentityResolution } from "../../entities/fiscal-identity.js";

/** API pública da identidade fiscal (usada pelo Financeiro e pelo Stock). */
export interface FiscalDocumentsPort {
  resolve(org: OrganizationId, input: FiscalIdentityInput): Promise<IdentityResolution>;
  claimForInvoice(org: OrganizationId, actor: string, input: FiscalIdentityInput, invoiceId: string, opts?: ClaimOptions): Promise<ClaimResult>;
  claimForStockImport(org: OrganizationId, actor: string, input: FiscalIdentityInput, stockImportId: string, opts?: Pick<ClaimOptions, "notADuplicate">): Promise<ClaimResult>;
  releaseInvoice(org: OrganizationId, actor: string, invoiceId: string): Promise<void>;
  backfill(org: OrganizationId, actor: string, docs: HistoricalDocument[], dryRun: boolean): Promise<BackfillReport>;
}

/** Documentos históricos de cada módulo (para a migração com simulação). */
export interface HistoricalDocumentsSourcePort {
  list(org: OrganizationId): Promise<HistoricalDocument[]>;
}
