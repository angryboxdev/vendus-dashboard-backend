import type { CostCenter } from "../../entities/cost-center.js";

export interface CostCenterFilter {
  category?: string;
  status?: "active" | "inactive";
}

export interface CostCenterRepositoryPort {
  save(costCenter: CostCenter): Promise<void>;
  findById(id: string): Promise<CostCenter | null>;
  findByCode(code: string): Promise<CostCenter | null>;
  findAll(filter?: CostCenterFilter): Promise<CostCenter[]>;
  update(costCenter: CostCenter): Promise<void>;
}
