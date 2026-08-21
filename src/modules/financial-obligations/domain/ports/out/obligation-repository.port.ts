import type { FinancialObligation, ObligationSource, ObligationStatus } from "../../entities/financial-obligation.js";

export interface ObligationFilter {
  from?: Date;
  to?: Date;
  supplierId?: string;
  status?: ObligationStatus;
  source?: ObligationSource;
}

export interface FinancialObligationRepositoryPort {
  save(obligation: FinancialObligation): Promise<void>;
  findById(id: string): Promise<FinancialObligation | null>;
  findAll(filter?: ObligationFilter): Promise<FinancialObligation[]>;
  update(obligation: FinancialObligation): Promise<void>;
}
