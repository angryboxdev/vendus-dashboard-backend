import type { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import type {
  BankStatementImportFilter,
  BankStatementImportRepositoryPort,
} from "../../domain/ports/out/bank-statement-import-repository.port.js";

export class FakeBankStatementImportRepository
  implements BankStatementImportRepositoryPort
{
  private store = new Map<string, BankStatementImport>();

  async save(statement: BankStatementImport): Promise<void> {
    this.store.set(statement.id, statement);
  }

  async findById(id: string): Promise<BankStatementImport | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(filter?: BankStatementImportFilter): Promise<BankStatementImport[]> {
    let results = [...this.store.values()];
    if (filter?.accountNumber) {
      results = results.filter((s) => s.accountNumber === filter.accountNumber);
    }
    if (filter?.status) {
      results = results.filter((s) => s.status === filter.status);
    }
    return results;
  }

  async update(statement: BankStatementImport): Promise<void> {
    if (!this.store.has(statement.id)) {
      throw new Error(`Statement ${statement.id} not found`);
    }
    this.store.set(statement.id, statement);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
