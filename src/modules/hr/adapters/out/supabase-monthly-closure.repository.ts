import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { MonthlyClosure } from "../../domain/entities/monthly-closure.js";
import type { MonthlyClosureRepositoryPort } from "../../domain/ports/out/monthly-closure-repository.port.js";

interface Row {
  id: string;
  year: number;
  month: number;
  status: "open" | "closed";
  closed_by: string | null;
  closed_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  created_at: string;
}

function rowToEntity(row: Row, organizationId: string): MonthlyClosure {
  return MonthlyClosure.reconstitute({
    id: row.id,
    organizationId,
    year: row.year,
    month: row.month,
    status: row.status,
    closedBy: row.closed_by,
    closedAt: row.closed_at,
    reopenedBy: row.reopened_by,
    reopenedAt: row.reopened_at,
    reopenReason: row.reopen_reason,
    createdAt: row.created_at,
  });
}

export class SupabaseMonthlyClosureRepository implements MonthlyClosureRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findByPeriod(organizationId: OrganizationId, year: number, month: number): Promise<MonthlyClosure | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_monthly_closures")
      .select("id, year, month, status, closed_by, closed_at, reopened_by, reopened_at, reopen_reason, created_at")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToEntity(data as unknown as Row, String(organizationId)) : null;
  }

  async save(organizationId: OrganizationId, closure: MonthlyClosure): Promise<MonthlyClosure> {
    const props = closure.toProps();
    const payload = {
      year: props.year,
      month: props.month,
      status: props.status,
      closed_by: props.closedBy,
      closed_at: props.closedAt,
      reopened_by: props.reopenedBy,
      reopened_at: props.reopenedAt,
      reopen_reason: props.reopenReason,
      updated_at: new Date().toISOString(),
    };

    if (props.id) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("hr_monthly_closures")
        .update(payload)
        .eq("id", props.id)
        .select("id, year, month, status, closed_by, closed_at, reopened_by, reopened_at, reopen_reason, created_at")
        .single();
      if (error) throw new Error(error.message);
      return rowToEntity(data as unknown as Row, String(organizationId));
    }

    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_monthly_closures")
      .insert({ id: randomUUID(), ...payload })
      .select("id, year, month, status, closed_by, closed_at, reopened_by, reopened_at, reopen_reason, created_at")
      .single();
    if (error) throw new Error(error.message);
    return rowToEntity(data as unknown as Row, String(organizationId));
  }
}
