import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { ForecastFeedback } from "../../domain/entities/forecast-feedback.js";
import type { ForecastFeedbackRepositoryPort } from "../../domain/ports/out/forecast-feedback-repository.port.js";

interface Row {
  id: string;
  location_id: string;
  period_date: string;
  forecast_value: number;
  actual_value: number;
  deviation_percent: number | null;
  reason_code: string | null;
  comment: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  created_at: string;
}

function toEntity(organizationId: OrganizationId, row: Row): ForecastFeedback {
  return ForecastFeedback.reconstitute({
    id: row.id,
    organizationId,
    locationId: row.location_id,
    periodDate: row.period_date,
    forecastValue: Number(row.forecast_value),
    actualValue: Number(row.actual_value),
    deviationPercent: row.deviation_percent != null ? Number(row.deviation_percent) : null,
    reasonCode: row.reason_code,
    comment: row.comment,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at ? new Date(row.submitted_at) : null,
    createdAt: new Date(row.created_at),
  });
}

function toRow(feedback: ForecastFeedback): Record<string, unknown> {
  const p = feedback.toProps();
  return {
    id: p.id,
    location_id: p.locationId,
    period_date: p.periodDate,
    forecast_value: p.forecastValue,
    actual_value: p.actualValue,
    deviation_percent: p.deviationPercent,
    reason_code: p.reasonCode,
    comment: p.comment,
    submitted_by: p.submittedBy,
    submitted_at: p.submittedAt ? p.submittedAt.toISOString() : null,
    created_at: p.createdAt.toISOString(),
  };
}

/** `UNIQUE(org_id, location_id, period_date)` — uma linha por anomalia, nunca duplicada por reprocessamento. */
export class SupabaseForecastFeedbackRepository implements ForecastFeedbackRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findByPeriod(organizationId: OrganizationId, locationId: string, periodDate: string): Promise<ForecastFeedback | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("forecast_feedback")
      .select("*")
      .eq("location_id", locationId)
      .eq("period_date", periodDate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(organizationId, data as unknown as Row) : null;
  }

  async findById(organizationId: OrganizationId, id: string): Promise<ForecastFeedback | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("forecast_feedback").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(organizationId, data as unknown as Row) : null;
  }

  async findPending(organizationId: OrganizationId, locationId: string): Promise<ForecastFeedback[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("forecast_feedback")
      .select("*")
      .eq("location_id", locationId)
      .is("submitted_at", null)
      .order("period_date", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map((r) => toEntity(organizationId, r));
  }

  async insert(organizationId: OrganizationId, feedback: ForecastFeedback): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("forecast_feedback")
      .upsert(toRow(feedback), { onConflict: "org_id,location_id,period_date", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  async save(organizationId: OrganizationId, feedback: ForecastFeedback): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("forecast_feedback").update(toRow(feedback)).eq("id", feedback.id);
    if (error) throw new Error(error.message);
  }
}
