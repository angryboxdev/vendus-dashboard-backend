import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { BankStatementImport, StatementStatus } from "../../entities/bank-statement-import.js";

export interface BankStatementImportFilter {
  accountNumber?: string;
  status?: StatementStatus;
  from?: Date;
  to?: Date;
}

export interface BankStatementImportRepositoryPort {
  save(organizationId: OrganizationId, statement: BankStatementImport): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<BankStatementImport | null>;
  findAll(organizationId: OrganizationId, filter?: BankStatementImportFilter): Promise<BankStatementImport[]>;
  update(organizationId: OrganizationId, statement: BankStatementImport): Promise<void>;
  delete(organizationId: OrganizationId, id: string): Promise<void>;
}
