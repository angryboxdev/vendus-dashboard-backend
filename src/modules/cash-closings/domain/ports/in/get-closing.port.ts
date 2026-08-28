import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CashClosingDto } from "./shared-dto.js";

export interface GetClosingQuery {
  /** Rota gerida (manager+): fornecido pelo controller a partir do auth payload. */
  organizationId: OrganizationId;
  id: string;
}

export interface GetClosingPort {
  execute(query: GetClosingQuery): Promise<CashClosingDto>;
}
