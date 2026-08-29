import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { BankAccountReadPort } from "../../domain/ports/out/bank-account-read.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeBankAccountRead implements BankAccountReadPort {
  private accounts = new Map<string, { id: string; accountNumber?: string }>();

  seed(organizationId: OrganizationId, id: string, accountNumber?: string): void {
    this.accounts.set(key(organizationId, id), { id, accountNumber });
  }

  async findByAccountNumber(
    organizationId: OrganizationId,
    raw: string
  ): Promise<{ id: string } | null> {
    const prefix = `${organizationId}:`;
    for (const [k, acc] of this.accounts.entries()) {
      if (k.startsWith(prefix) && acc.accountNumber === raw) return { id: acc.id };
    }
    return null;
  }

  async findById(organizationId: OrganizationId, id: string): Promise<{ id: string } | null> {
    return this.accounts.get(key(organizationId, id)) ?? null;
  }
}
