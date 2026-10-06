import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { Weekday } from "../../domain/entities/base-schedule-template.js";
import { ShiftAutomation, type ShiftAutomationStatus } from "../../domain/entities/shift-automation.js";
import type {
  AutomationIssue,
  AutomationIssueRepositoryPort,
  AutomationIssueStatus,
  ShiftAutomationRepositoryPort,
} from "../../domain/ports/out/shift-automation-repository.port.js";
import type { ApplicationAudience } from "../../domain/services/template-application.service.js";

const SELECT =
  "id, name, description, kind, template_id, audience, location_id, weekdays, start_date, end_date, horizon_weeks, status, generated_until, last_run_at, created_by, created_at, updated_at";

interface Row {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  template_id: string;
  audience: ApplicationAudience;
  location_id: string | null;
  weekdays: number[];
  start_date: string;
  end_date: string | null;
  horizon_weeks: number;
  status: string;
  generated_until: string | null;
  last_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function toEntity(row: Row): ShiftAutomation {
  return ShiftAutomation.reconstitute({
    id: row.id,
    name: row.name,
    description: row.description,
    kind: "weekly",
    templateId: row.template_id,
    audience: row.audience,
    locationId: row.location_id,
    weekdays: row.weekdays as Weekday[],
    startDate: row.start_date,
    endDate: row.end_date,
    horizonWeeks: row.horizon_weeks,
    status: row.status as ShiftAutomationStatus,
    generatedUntil: row.generated_until,
    lastRunAt: row.last_run_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/** `org_id` é carimbado pelo `ScopedQuery`. */
function toRow(a: ShiftAutomation): Omit<Row, "id" | "created_at" | "created_by"> {
  const p = a.toProps();
  return {
    name: p.name,
    description: p.description,
    kind: p.kind,
    template_id: p.templateId,
    audience: p.audience,
    location_id: p.locationId,
    weekdays: p.weekdays,
    start_date: p.startDate,
    end_date: p.endDate,
    horizon_weeks: p.horizonWeeks,
    status: p.status,
    generated_until: p.generatedUntil,
    last_run_at: p.lastRunAt,
    updated_at: p.updatedAt,
  };
}

/** Tabela `hr_shift_automations` (RH 2.0, ticket 03). */
export class SupabaseShiftAutomationRepository implements ShiftAutomationRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findAll(organizationId: OrganizationId): Promise<ShiftAutomation[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_shift_automations").select(SELECT).order("name");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toEntity);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<ShiftAutomation | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_shift_automations").select(SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as Row) : null;
  }

  async insert(organizationId: OrganizationId, automation: ShiftAutomation): Promise<void> {
    const p = automation.toProps();
    const { error } = await this.scopedQuery(organizationId)
      .table("hr_shift_automations")
      .insert({ id: p.id, created_at: p.createdAt, created_by: p.createdBy, ...toRow(automation) });
    if (error) throw new Error(error.message);
  }

  async update(organizationId: OrganizationId, automation: ShiftAutomation): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("hr_shift_automations").update(toRow(automation)).eq("id", automation.id);
    if (error) throw new Error(error.message);
  }
}

const ISSUE_SELECT = "id, automation_id, employee_id, work_date, status, dismissed_at";

interface IssueRow {
  id: string;
  automation_id: string;
  employee_id: string;
  work_date: string;
  status: string;
  dismissed_at: string | null;
}

const toIssue = (row: IssueRow): AutomationIssue => ({
  id: row.id,
  automationId: row.automation_id,
  employeeId: row.employee_id,
  workDate: row.work_date,
  status: row.status as AutomationIssueStatus,
  dismissedAt: row.dismissed_at,
});

/** Tabela `hr_shift_automation_issues` (RH 2.0, ticket 03). */
export class SupabaseAutomationIssueRepository implements AutomationIssueRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async upsertMany(organizationId: OrganizationId, issues: Omit<AutomationIssue, "id" | "dismissedAt">[]): Promise<void> {
    if (issues.length === 0) return;
    const rows = issues.map((i) => ({
      automation_id: i.automationId,
      employee_id: i.employeeId,
      work_date: i.workDate,
      status: i.status,
      detected_at: new Date().toISOString(),
      dismissed_at: null,
      dismissed_by: null,
    }));
    const { error } = await this.scopedQuery(organizationId)
      .table("hr_shift_automation_issues")
      .upsert(rows, { onConflict: "org_id,automation_id,employee_id,work_date" });
    if (error) throw new Error(error.message);
  }

  async findOpenInRange(organizationId: OrganizationId, from: string, to: string): Promise<AutomationIssue[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_shift_automation_issues")
      .select(ISSUE_SELECT)
      .is("dismissed_at", null)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as IssueRow[]).map(toIssue);
  }

  async countOpenByAutomation(organizationId: OrganizationId): Promise<Map<string, number>> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_shift_automation_issues").select("automation_id").is("dismissed_at", null);
    if (error) throw new Error(error.message);
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as unknown as { automation_id: string }[]) counts.set(r.automation_id, (counts.get(r.automation_id) ?? 0) + 1);
    return counts;
  }

  async findById(organizationId: OrganizationId, id: string): Promise<AutomationIssue | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_shift_automation_issues").select(ISSUE_SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toIssue(data as unknown as IssueRow) : null;
  }

  async dismiss(organizationId: OrganizationId, id: string, actor: string, at: Date): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("hr_shift_automation_issues")
      .update({ dismissed_at: at.toISOString(), dismissed_by: actor })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}
