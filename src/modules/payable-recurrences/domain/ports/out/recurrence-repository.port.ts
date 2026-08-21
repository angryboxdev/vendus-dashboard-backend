import type { Recurrence, RecurrenceStatus, RecurrenceType } from "../../entities/recurrence.js";

export interface RecurrenceFilter {
  status?: RecurrenceStatus;
  type?: RecurrenceType;
  supplierId?: string;
}

export interface RecurrenceRepositoryPort {
  save(recurrence: Recurrence): Promise<void>;
  update(recurrence: Recurrence): Promise<void>;
  findById(id: string): Promise<Recurrence | null>;
  findAll(filter?: RecurrenceFilter): Promise<Recurrence[]>;
}
