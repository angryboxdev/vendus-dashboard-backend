import type { PayableEntry, PayableStatus } from "../../entities/payable-entry.js";

export interface PayableEntryFilter {
  supplierId?: string;
  costCenterId?: string;
  status?: PayableStatus;
  from?: Date;
  to?: Date;
}

export interface PayableEntryRepositoryPort {
  save(entry: PayableEntry): Promise<void>;
  findById(id: string): Promise<PayableEntry | null>;
  findAll(filter?: PayableEntryFilter): Promise<PayableEntry[]>;
  update(entry: PayableEntry): Promise<void>;
  delete(id: string): Promise<void>;
}
