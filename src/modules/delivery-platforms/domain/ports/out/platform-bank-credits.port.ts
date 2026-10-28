import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PlatformBankCredit } from "../../entities/payout-reconciliation.js";

/** Créditos das plataformas no banco (todas as contas da organização). */
export interface PlatformBankCreditsReadPort {
  credits(organizationId: OrganizationId, from: string, to: string): Promise<PlatformBankCredit[]>;
  /** Último dia com movimentos importados (para saber se uma transferência ainda pode chegar). */
  lastBookingDate(organizationId: OrganizationId): Promise<string | null>;
}
