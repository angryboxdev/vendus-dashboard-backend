import type { CashClosing, CashClosingStatus } from "../../entities/cash-closing.js";

export interface ClosingListFilter {
  from?: string | undefined;
  to?: string | undefined;
  status?: CashClosingStatus | undefined;
  employeeId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface CashClosingRepositoryPort {
  save(closing: CashClosing): Promise<void>;
  findById(id: string): Promise<CashClosing | null>;
  list(filter: ClosingListFilter): Promise<{ closings: CashClosing[]; total: number }>;
  update(closing: CashClosing): Promise<void>;
  existsForEmployeeOnDate(employeeId: string, closingDate: string): Promise<boolean>;
  /** Modo sessions: verifica se já existe um fecho para esta sessão Vendus. */
  existsForSession(sessionOpenedAt: string): Promise<boolean>;
}
