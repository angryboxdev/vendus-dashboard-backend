import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AccountingDocument } from "../../entities/accounting-document.js";

export interface AccountingDocumentFilter {
  from?: string;
  to?: string;
}

export interface PossibleDuplicateCriteria {
  nif: string | null;
  documentNumber: string | null;
  issueDate: string;
  totalWithVat: number;
}

export interface AccountingDocumentRepositoryPort {
  save(organizationId: OrganizationId, document: AccountingDocument): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<AccountingDocument | null>;
  findAll(organizationId: OrganizationId, filter?: AccountingDocumentFilter): Promise<AccountingDocument[]>;
  /**
   * Deteção de duplicados (secção 9 da task) — cruza NIF+número+data+total
   * contra documentos já existentes desta tabela (o cruzamento com
   * `invoices` é feito à parte, no use case, via `ListInvoicesPort`).
   * `excludeId` evita que uma atualização se detete a si própria.
   */
  findPossibleDuplicate(
    organizationId: OrganizationId,
    criteria: PossibleDuplicateCriteria,
    excludeId?: string,
  ): Promise<AccountingDocument | null>;
}
