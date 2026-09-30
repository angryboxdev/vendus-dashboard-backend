import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { TolerancePolicy } from "../../services/tolerance.service.js";

export interface CompanyCountSettings {
  defaultTolerance: TolerancePolicy | null;
  blindCountDefault: boolean;
  /** `null` = sem limite. */
  maxRecounts: number | null;
}

/** Tolerância padrão da empresa (nível mais baixo da hierarquia), `blind_count` e `max_recounts`. */
export interface StockCountSettingsPort {
  get(organizationId: OrganizationId): Promise<CompanyCountSettings>;
}
