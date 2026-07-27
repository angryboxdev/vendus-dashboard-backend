import type { Bank } from "../../entities/bank.js";

export interface BankRepositoryPort {
  save(bank: Bank): Promise<void>;
  findById(id: string): Promise<Bank | null>;
  findAll(): Promise<Bank[]>;
  update(bank: Bank): Promise<void>;
  delete(id: string): Promise<void>;
}
