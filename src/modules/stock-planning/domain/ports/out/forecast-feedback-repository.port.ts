import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ForecastFeedback } from "../../entities/forecast-feedback.js";

/** `UNIQUE(org_id, location_id, period_date)` — uma linha por anomalia, nunca duplicada por reprocessamento (secção 34/97). */
export interface ForecastFeedbackRepositoryPort {
  findByPeriod(organizationId: OrganizationId, locationId: string, periodDate: string): Promise<ForecastFeedback | null>;
  findById(organizationId: OrganizationId, id: string): Promise<ForecastFeedback | null>;
  findPending(organizationId: OrganizationId, locationId: string): Promise<ForecastFeedback[]>;
  insert(organizationId: OrganizationId, feedback: ForecastFeedback): Promise<void>;
  save(organizationId: OrganizationId, feedback: ForecastFeedback): Promise<void>;
}
