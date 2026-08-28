import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CashClosingStatus } from "../../entities/cash-closing.js";
import type { CashClosingDto } from "./shared-dto.js";

export interface ListClosingsQuery {
  /** Rota gerida (manager+): fornecido pelo controller a partir do auth payload. */
  organizationId: OrganizationId;
  /** Intervalo de datas (YYYY-MM-DD). Usado por week view e month view. */
  from?: string | undefined;
  to?: string | undefined;
  /** Filtro por data exacta — atalho para from=to=date (backward compat). */
  date?: string | undefined;
  status?: CashClosingStatus | undefined;
  employeeId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ListClosingsResult {
  closings: CashClosingDto[];
  total: number;
}

export interface ListClosingsPort {
  execute(query: ListClosingsQuery): Promise<ListClosingsResult>;
}
