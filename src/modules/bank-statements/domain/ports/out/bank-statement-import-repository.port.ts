import type { BankStatementImport, StatementStatus } from "../../entities/bank-statement-import.js";

export interface BankStatementImportFilter {
  accountNumber?: string;
  status?: StatementStatus;
  from?: Date;
  to?: Date;
}

export interface BankStatementImportRepositoryPort {
  save(statement: BankStatementImport): Promise<void>;
  findById(id: string): Promise<BankStatementImport | null>;
  findAll(filter?: BankStatementImportFilter): Promise<BankStatementImport[]>;
  update(statement: BankStatementImport): Promise<void>;
  delete(id: string): Promise<void>;
}
