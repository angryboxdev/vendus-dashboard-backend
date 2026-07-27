import { Bank } from "../../domain/entities/bank.js";
import type { BankRepositoryPort } from "../../domain/ports/out/bank-repository.port.js";

export class FakeBankRepository implements BankRepositoryPort {
  private store = new Map<string, Bank>();

  async save(bank: Bank): Promise<void> {
    this.store.set(bank.id, bank);
  }

  async findById(id: string): Promise<Bank | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(): Promise<Bank[]> {
    return [...this.store.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async update(bank: Bank): Promise<void> {
    this.store.set(bank.id, bank);
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}
