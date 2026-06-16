import type { Supplier } from "../../entities/supplier.js";

export interface SupplierFilter {
  status?: "active" | "inactive";
  search?: string;
}

export interface SupplierRepositoryPort {
  save(supplier: Supplier): Promise<void>;
  findById(id: string): Promise<Supplier | null>;
  findAll(filter?: SupplierFilter): Promise<Supplier[]>;
  update(supplier: Supplier): Promise<void>;
}
