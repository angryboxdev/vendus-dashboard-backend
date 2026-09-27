import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { BaseScheduleTemplate, type Weekday } from "../../domain/entities/base-schedule-template.js";
import type { BaseScheduleRepositoryPort } from "../../domain/ports/out/base-schedule-repository.port.js";

const SELECT = "id, employee_id, weekday, is_day_off, start_time, end_time, location_id, break_minutes, created_at, updated_at";

interface Row {
  id: string;
  employee_id: string;
  weekday: number;
  is_day_off: boolean;
  start_time: string | null;
  end_time: string | null;
  location_id: string | null;
  break_minutes: number;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: Row): BaseScheduleTemplate {
  return BaseScheduleTemplate.reconstitute({
    id: row.id,
    employeeId: row.employee_id,
    weekday: row.weekday as Weekday,
    isDayOff: row.is_day_off,
    startTime: row.start_time ? row.start_time.slice(0, 5) : null,
    endTime: row.end_time ? row.end_time.slice(0, 5) : null,
    locationId: row.location_id,
    breakMinutes: row.break_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SupabaseBaseScheduleRepository implements BaseScheduleRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findByEmployee(organizationId: OrganizationId, employeeId: string): Promise<BaseScheduleTemplate[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_base_schedule_templates")
      .select(SELECT)
      .eq("employee_id", employeeId)
      .order("weekday");
    if (error) throw new Error(error.message);
    return (data as unknown as Row[]).map(rowToTemplate);
  }

  async findAll(organizationId: OrganizationId): Promise<BaseScheduleTemplate[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_base_schedule_templates")
      .select(SELECT);
    if (error) throw new Error(error.message);
    return (data as unknown as Row[]).map(rowToTemplate);
  }

  async upsert(organizationId: OrganizationId, template: BaseScheduleTemplate): Promise<BaseScheduleTemplate> {
    const props = template.toProps();
    const row = {
      employee_id: props.employeeId,
      weekday: props.weekday,
      is_day_off: props.isDayOff,
      start_time: props.startTime,
      end_time: props.endTime,
      location_id: props.locationId,
      break_minutes: props.breakMinutes,
      updated_at: props.updatedAt,
    };
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_base_schedule_templates")
      .upsert(row, { onConflict: "org_id,employee_id,weekday" })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToTemplate(data as unknown as Row);
  }
}
