import type { BankAccount } from "../../entities/bank-account.js";

export interface BankAccountRepositoryPort {
  save(account: BankAccount): Promise<void>;
  findById(id: string): Promise<BankAccount | null>;
  findByBankId(bankId: string): Promise<BankAccount[]>;
  findByAccountNumber(raw: string): Promise<BankAccount | null>;
  update(account: BankAccount): Promise<void>;
  delete(id: string): Promise<void>;
  countStatements(accountId: string): Promise<number>;
}
