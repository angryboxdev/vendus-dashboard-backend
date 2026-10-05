import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { ShiftTemplate } from "../../domain/entities/shift-template.js";
import { DuplicateShiftTemplateNameError } from "../../domain/errors.js";
import type { ShiftTemplateRepositoryPort } from "../../domain/ports/out/shift-template-repository.port.js";

const SELECT =
  "id, name, description, color, start_time, end_time, ends_next_day, second_start_time, second_end_time, break_minutes, location_id, active, created_by, created_at, updated_at";

interface Row {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  start_time: string;
  end_time: string;
  ends_next_day: boolean;
  second_start_time: string | null;
  second_end_time: string | null;
  break_minutes: number;
  location_id: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** `time` do Postgres vem como "HH:mm:ss" — o domínio usa "HH:mm". */
const hhmm = (t: string | null) => (t === null ? null : t.slice(0, 5));

function toEntity(row: Row): ShiftTemplate {
  return ShiftTemplate.reconstitute({
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    startTime: hhmm(row.start_time)!,
    endTime: hhmm(row.end_time)!,
    endsNextDay: row.ends_next_day,
    secondStartTime: hhmm(row.second_start_time),
    secondEndTime: hhmm(row.second_end_time),
    breakMinutes: row.break_minutes,
    locationId: row.location_id,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/** `normalized_name` é coluna gerada e `org_id` é carimbado pelo `ScopedQuery` — nunca escritos aqui. */
function toRow(template: ShiftTemplate): Omit<Row, "id" | "created_at" | "created_by"> {
  const p = template.toProps();
  return {
    name: p.name,
    description: p.description,
    color: p.color,
    start_time: p.startTime,
    end_time: p.endTime,
    ends_next_day: p.endsNextDay,
    second_start_time: p.secondStartTime,
    second_end_time: p.secondEndTime,
    break_minutes: p.breakMinutes,
    location_id: p.locationId,
    active: p.active,
    updated_at: p.updatedAt,
  };
}

function throwWriteError(error: { code?: string; message: string }, template: ShiftTemplate): never {
  if (error.code === "23505") throw new DuplicateShiftTemplateNameError(template.name);
  throw new Error(error.message);
}

/** Tabela `hr_shift_templates` (RH 2.0, ticket 01). */
export class SupabaseShiftTemplateRepository implements ShiftTemplateRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findAll(organizationId: OrganizationId): Promise<ShiftTemplate[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_shift_templates").select(SELECT).order("name");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toEntity);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<ShiftTemplate | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_shift_templates").select(SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as Row) : null;
  }

  async insert(organizationId: OrganizationId, template: ShiftTemplate): Promise<void> {
    const p = template.toProps();
    const { error } = await this.scopedQuery(organizationId)
      .table("hr_shift_templates")
      .insert({ id: p.id, created_at: p.createdAt, created_by: p.createdBy, ...toRow(template) });
    if (error) throwWriteError(error, template);
  }

  async update(organizationId: OrganizationId, template: ShiftTemplate): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("hr_shift_templates").update(toRow(template)).eq("id", template.id);
    if (error) throwWriteError(error, template);
  }
}
