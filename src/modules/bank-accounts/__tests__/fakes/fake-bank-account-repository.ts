import { BankAccount } from "../../domain/entities/bank-account.js";
import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";

export class FakeBankAccountRepository implements BankAccountRepositoryPort {
  private store = new Map<string, BankAccount>();
  private statementCounts = new Map<string, number>();

  async save(account: BankAccount): Promise<void> {
    this.store.set(account.id, account);
  }

  async findById(id: string): Promise<BankAccount | null> {
    return this.store.get(id) ?? null;
  }

  async findByBankId(bankId: string): Promise<BankAccount[]> {
    return [...this.store.values()]
      .filter((a) => a.bankId === bankId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findByAccountNumber(raw: string): Promise<BankAccount | null> {
    for (const account of this.store.values()) {
      if (account.matchesAccountNumber(raw)) return account;
    }
    return null;
  }

  async update(account: BankAccount): Promise<void> {
    this.store.set(account.id, account);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async countStatements(accountId: string): Promise<number> {
    return this.statementCounts.get(accountId) ?? 0;
  }

  // Test helper
  setStatementCount(accountId: string, count: number): void {
    this.statementCounts.set(accountId, count);
  }
}
