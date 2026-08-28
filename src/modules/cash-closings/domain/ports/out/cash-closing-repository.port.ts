import type { OrganizationId } from "../../../../../kernel/organization-id.js";
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
  save(organizationId: OrganizationId, closing: CashClosing): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<CashClosing | null>;
  list(
    organizationId: OrganizationId,
    filter: ClosingListFilter,
  ): Promise<{ closings: CashClosing[]; total: number }>;
  update(organizationId: OrganizationId, closing: CashClosing): Promise<void>;
  existsForEmployeeOnDate(
    organizationId: OrganizationId,
    employeeId: string,
    closingDate: string,
  ): Promise<boolean>;
  /** Modo sessions: verifica se já existe um fecho para esta sessão Vendus. */
  existsForSession(organizationId: OrganizationId, sessionOpenedAt: string): Promise<boolean>;
}
