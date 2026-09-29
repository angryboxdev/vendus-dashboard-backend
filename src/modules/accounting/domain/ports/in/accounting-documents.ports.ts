import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export type AccountingDocumentSource = "invoice" | "accounting_document";

/**
 * "Documentos" (vista agregada, decisão confirmada com o utilizador) — nunca
 * um CRUD paralelo de faturas. Cada linha é só leitura, resolvida a partir de
 * `invoices` (faturas/notas de crédito pagas pela conta/cartão/caixa da
 * empresa, já existentes) ou de `AccountingDocument` (secção 5 da task —
 * qualquer documento sem esse fluxo bancário normal).
 */
export interface AccountingDocumentRowDTO {
  id: string;
  source: AccountingDocumentSource;
  documentType: string;
  fundingSource: string | null;
  entityName: string;
  nif: string | null;
  documentNumber: string | null;
  date: string;
  totalWithVat: number;
  status: string;
  costCenterCategoryId: string | null;
}

export interface ListAccountingDocumentsCommand {
  organizationId: OrganizationId;
  from?: string;
  to?: string;
}

export interface ListAccountingDocumentsPort {
  execute(command: ListAccountingDocumentsCommand): Promise<AccountingDocumentRowDTO[]>;
}
