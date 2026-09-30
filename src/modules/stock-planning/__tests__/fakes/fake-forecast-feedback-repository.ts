import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ForecastFeedback } from "../../domain/entities/forecast-feedback.js";
import type { ForecastFeedbackRepositoryPort } from "../../domain/ports/out/forecast-feedback-repository.port.js";

export class FakeForecastFeedbackRepository implements ForecastFeedbackRepositoryPort {
  feedback = new Map<string, ForecastFeedback>();

  async findByPeriod(_organizationId: OrganizationId, locationId: string, periodDate: string): Promise<ForecastFeedback | null> {
    return [...this.feedback.values()].find((f) => f.toProps().locationId === locationId && f.periodDate === periodDate) ?? null;
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<ForecastFeedback | null> {
    return this.feedback.get(id) ?? null;
  }

  async findPending(_organizationId: OrganizationId, locationId: string): Promise<ForecastFeedback[]> {
    return [...this.feedback.values()].filter((f) => f.toProps().locationId === locationId && !f.isSubmitted);
  }

  async insert(_organizationId: OrganizationId, feedback: ForecastFeedback): Promise<void> {
    const existing = await this.findByPeriod(_organizationId, feedback.toProps().locationId, feedback.periodDate);
    if (existing) return; // ON CONFLICT DO NOTHING, mesmo comportamento do adapter real.
    this.feedback.set(feedback.id, feedback);
  }

  async save(_organizationId: OrganizationId, feedback: ForecastFeedback): Promise<void> {
    this.feedback.set(feedback.id, feedback);
  }
}
