import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import type {
  BankStatementImportFilter,
  BankStatementImportRepositoryPort,
} from "../../domain/ports/out/bank-statement-import-repository.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeBankStatementImportRepository
  implements BankStatementImportRepositoryPort
{
  private store = new Map<string, BankStatementImport>();

  async save(organizationId: OrganizationId, statement: BankStatementImport): Promise<void> {
    this.store.set(key(organizationId, statement.id), statement);
  }

  async findById(
    organizationId: OrganizationId,
    id: string
  ): Promise<BankStatementImport | null> {
    return this.store.get(key(organizationId, id)) ?? null;
  }

  async findAll(
    organizationId: OrganizationId,
    filter?: BankStatementImportFilter
  ): Promise<BankStatementImport[]> {
    const prefix = `${organizationId}:`;
    let results = [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, s]) => s);
    if (filter?.accountNumber) {
      results = results.filter((s) => s.accountNumber === filter.accountNumber);
    }
    if (filter?.status) {
      results = results.filter((s) => s.status === filter.status);
    }
    return results;
  }

  async update(organizationId: OrganizationId, statement: BankStatementImport): Promise<void> {
    const k = key(organizationId, statement.id);
    if (!this.store.has(k)) {
      throw new Error(`Statement ${statement.id} not found`);
    }
    this.store.set(k, statement);
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    this.store.delete(key(organizationId, id));
  }
}
