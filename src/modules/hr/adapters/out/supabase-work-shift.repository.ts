import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { WorkShift, type ShiftSource, type ShiftStatus } from "../../domain/entities/work-shift.js";
import type {
  WorkShiftFilter,
  WorkShiftRepositoryPort,
  ShiftAttendanceStatusValue,
} from "../../domain/ports/out/work-shift-repository.port.js";

const SELECT =
  "id, employee_id, work_date, start_time, end_time, ends_next_day, second_start_time, second_end_time, location_id, break_minutes, notes, status, source, rotation_id, series_id, template_id, automation_id, created_at, updated_at";

interface Row {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  ends_next_day: boolean;
  second_start_time: string | null;
  second_end_time: string | null;
  location_id: string;
  break_minutes: number;
  notes: string | null;
  status: string;
  source: string;
  rotation_id: string | null;
  series_id: string | null;
  template_id: string | null;
  automation_id: string | null;
  created_at: string;
  updated_at: string;
}

const PAGE_SIZE = 1000;
const ID_BATCH = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function rowToShift(row: Row): WorkShift {
  return WorkShift.reconstitute({
    id: row.id,
    employeeId: row.employee_id,
    workDate: row.work_date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    endsNextDay: row.ends_next_day,
    secondStartTime: row.second_start_time?.slice(0, 5) ?? null,
    secondEndTime: row.second_end_time?.slice(0, 5) ?? null,
    locationId: row.location_id,
    breakMinutes: row.break_minutes,
    notes: row.notes,
    status: row.status as ShiftStatus,
    source: row.source as ShiftSource,
    rotationId: row.rotation_id,
    seriesId: row.series_id,
    templateId: row.template_id ?? null,
    automationId: row.automation_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function shiftToRow(shift: WorkShift): Record<string, unknown> {
  const props = shift.toProps();
  return {
    id: props.id,
    employee_id: props.employeeId,
    work_date: props.workDate,
    start_time: props.startTime,
    end_time: props.endTime,
    ends_next_day: props.endsNextDay,
    second_start_time: props.secondStartTime,
    second_end_time: props.secondEndTime,
    location_id: props.locationId,
    break_minutes: props.breakMinutes,
    notes: props.notes,
    status: props.status,
    source: props.source,
    rotation_id: props.rotationId,
    series_id: props.seriesId,
    template_id: props.templateId,
    automation_id: props.automationId,
    updated_at: props.updatedAt,
  };
}

export class SupabaseWorkShiftRepository implements WorkShiftRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findInRange(organizationId: OrganizationId, filter: WorkShiftFilter): Promise<WorkShift[]> {
    // Paginado: o PostgREST corta em 1000 linhas, e um período longo (limpeza em massa) passa disso.
    const rows: Row[] = [];
    for (let start = 0; ; start += PAGE_SIZE) {
      let query = this.scopedQuery(organizationId)
        .table("hr_work_shifts")
        .select(SELECT)
        .gte("work_date", filter.from)
        .lte("work_date", filter.to)
        .order("work_date")
        .order("start_time")
        .order("id");
      if (filter.employeeId) query = query.eq("employee_id", filter.employeeId);
      if (filter.locationId) query = query.eq("location_id", filter.locationId);
      if (filter.status) query = query.eq("status", filter.status);
      const { data, error } = await query.range(start, start + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = data as unknown as Row[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows.map(rowToShift);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<WorkShift | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_work_shifts")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToShift(data as unknown as Row);
  }

  async create(organizationId: OrganizationId, shift: WorkShift): Promise<WorkShift> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_work_shifts")
      .insert(shiftToRow(shift))
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToShift(data as unknown as Row);
  }

  async update(organizationId: OrganizationId, shift: WorkShift): Promise<WorkShift> {
    const { id, ...patch } = shiftToRow(shift);
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_work_shifts")
      .update(patch)
      .eq("id", id as string)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToShift(data as unknown as Row);
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("hr_work_shifts").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteMany(organizationId: OrganizationId, ids: string[]): Promise<void> {
    for (const batch of chunk(ids, ID_BATCH)) {
      const { error } = await this.scopedQuery(organizationId).table("hr_work_shifts").delete().in("id", batch);
      if (error) throw new Error(error.message);
    }
  }

  async hasAttendance(organizationId: OrganizationId, shiftId: string): Promise<boolean> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_shift_attendance")
      .select("id")
      .eq("work_shift_id", shiftId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data != null;
  }

  async findAttendanceStatusesByShiftIds(
    organizationId: OrganizationId,
    shiftIds: string[],
  ): Promise<Map<string, ShiftAttendanceStatusValue>> {
    const result = new Map<string, ShiftAttendanceStatusValue>();
    // Em lotes: muitos ids num `in(...)` estouram o tamanho do URL.
    for (const batch of chunk(shiftIds, ID_BATCH)) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("hr_shift_attendance")
        .select("work_shift_id, status")
        .in("work_shift_id", batch);
      if (error) throw new Error(error.message);
      for (const row of data as unknown as Array<{ work_shift_id: string; status: string }>) {
        result.set(row.work_shift_id, row.status as ShiftAttendanceStatusValue);
      }
    }
    return result;
  }

  async findBySeriesId(organizationId: OrganizationId, seriesId: string): Promise<WorkShift[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_work_shifts")
      .select(SELECT)
      .eq("series_id", seriesId)
      .order("work_date");
    if (error) throw new Error(error.message);
    return (data as unknown as Row[]).map(rowToShift);
  }
}
