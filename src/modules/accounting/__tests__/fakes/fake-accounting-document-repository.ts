import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AccountingDocument } from "../../domain/entities/accounting-document.js";
import type {
  AccountingDocumentFilter,
  AccountingDocumentRepositoryPort,
  PossibleDuplicateCriteria,
} from "../../domain/ports/out/accounting-document-repository.port.js";

export class FakeAccountingDocumentRepository implements AccountingDocumentRepositoryPort {
  rows = new Map<string, AccountingDocument>();

  seed(document: AccountingDocument): void {
    this.rows.set(document.id, document);
  }

  async save(_organizationId: OrganizationId, document: AccountingDocument): Promise<void> {
    this.rows.set(document.id, document);
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<AccountingDocument | null> {
    return this.rows.get(id) ?? null;
  }

  async findAll(_organizationId: OrganizationId, filter?: AccountingDocumentFilter): Promise<AccountingDocument[]> {
    return [...this.rows.values()].filter((d) => {
      if (filter?.from && d.issueDate < filter.from) return false;
      if (filter?.to && d.issueDate > filter.to) return false;
      return true;
    });
  }

  async findPossibleDuplicate(
    _organizationId: OrganizationId,
    criteria: PossibleDuplicateCriteria,
    excludeId?: string,
  ): Promise<AccountingDocument | null> {
    if (!criteria.nif && !criteria.documentNumber) return null;
    for (const d of this.rows.values()) {
      if (excludeId && d.id === excludeId) continue;
      if (d.status === "cancelled") continue;
      if (d.issueDate !== criteria.issueDate) continue;
      if (d.totalWithVat !== criteria.totalWithVat) continue;
      if (criteria.nif && d.nif !== criteria.nif) continue;
      if (criteria.documentNumber && d.documentNumber !== criteria.documentNumber) continue;
      return d;
    }
    return null;
  }
}
