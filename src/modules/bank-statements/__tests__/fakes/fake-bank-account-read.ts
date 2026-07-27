import type { BankAccountReadPort } from "../../domain/ports/out/bank-account-read.port.js";

export class FakeBankAccountRead implements BankAccountReadPort {
  private accounts = new Map<string, { id: string; accountNumber?: string }>();

  seed(id: string, accountNumber?: string): void {
    this.accounts.set(id, { id, accountNumber });
  }

  async findByAccountNumber(raw: string): Promise<{ id: string } | null> {
    for (const acc of this.accounts.values()) {
      if (acc.accountNumber === raw) return { id: acc.id };
    }
    return null;
  }

  async findById(id: string): Promise<{ id: string } | null> {
    return this.accounts.get(id) ?? null;
  }
}
