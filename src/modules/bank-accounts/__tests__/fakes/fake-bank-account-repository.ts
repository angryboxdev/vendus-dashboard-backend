import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { BankAccount } from "../../domain/entities/bank-account.js";
import type { BankAccountRepositoryPort } from "../../domain/ports/out/bank-account-repository.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeBankAccountRepository implements BankAccountRepositoryPort {
  private store = new Map<string, BankAccount>();
  private statementCounts = new Map<string, number>();

  async save(organizationId: OrganizationId, account: BankAccount): Promise<void> {
    this.store.set(key(organizationId, account.id), account);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<BankAccount | null> {
    return this.store.get(key(organizationId, id)) ?? null;
  }

  async findByBankId(organizationId: OrganizationId, bankId: string): Promise<BankAccount[]> {
    const prefix = `${organizationId}:`;
    return [...this.store.entries()]
      .filter(([k, a]) => k.startsWith(prefix) && a.bankId === bankId)
      .map(([, a]) => a)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findByAccountNumber(
    organizationId: OrganizationId,
    raw: string,
  ): Promise<BankAccount | null> {
    const prefix = `${organizationId}:`;
    for (const [k, account] of this.store.entries()) {
      if (k.startsWith(prefix) && account.matchesAccountNumber(raw)) return account;
    }
    return null;
  }

  async update(organizationId: OrganizationId, account: BankAccount): Promise<void> {
    this.store.set(key(organizationId, account.id), account);
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    this.store.delete(key(organizationId, id));
  }

  async countStatements(organizationId: OrganizationId, accountId: string): Promise<number> {
    return this.statementCounts.get(key(organizationId, accountId)) ?? 0;
  }

  // Test helper
  setStatementCount(organizationId: OrganizationId, accountId: string, count: number): void {
    this.statementCounts.set(key(organizationId, accountId), count);
  }
}
