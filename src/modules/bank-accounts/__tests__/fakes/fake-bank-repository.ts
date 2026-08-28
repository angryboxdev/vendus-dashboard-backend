import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { Bank } from "../../domain/entities/bank.js";
import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";

function key(organizationId: OrganizationId, id: string): string {
  return `${organizationId}:${id}`;
}

export class FakeBankRepository implements BankRepositoryPort {
  private store = new Map<string, Bank>();

  async save(organizationId: OrganizationId, bank: Bank): Promise<void> {
    this.store.set(key(organizationId, bank.id), bank);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Bank | null> {
    return this.store.get(key(organizationId, id)) ?? null;
  }

  async findAll(organizationId: OrganizationId): Promise<Bank[]> {
    const prefix = `${organizationId}:`;
    return [...this.store.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, bank]) => bank)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async update(organizationId: OrganizationId, bank: Bank): Promise<void> {
    this.store.set(key(organizationId, bank.id), bank);
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    this.store.delete(key(organizationId, id));
  }
}
