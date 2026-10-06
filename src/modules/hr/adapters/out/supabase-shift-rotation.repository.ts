import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { ShiftRotation } from "../../domain/entities/shift-rotation.js";
import type { ShiftRotationRepositoryPort } from "../../domain/ports/out/shift-rotation-repository.port.js";

const SELECT =
  "id, participant_employee_ids, pattern_a_start_time, pattern_a_end_time, pattern_a_second_start_time, pattern_a_second_end_time, pattern_b_start_time, pattern_b_end_time, pattern_b_second_start_time, pattern_b_second_end_time, location_id, anchor_date, auto_switch_weekly, active, created_by, created_at, updated_at";

interface Row {
  id: string;
  participant_employee_ids: string[];
  pattern_a_start_time: string;
  pattern_a_end_time: string;
  pattern_a_second_start_time: string | null;
  pattern_a_second_end_time: string | null;
  pattern_b_start_time: string;
  pattern_b_end_time: string;
  pattern_b_second_start_time: string | null;
  pattern_b_second_end_time: string | null;
  location_id: string;
  anchor_date: string;
  auto_switch_weekly: boolean;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRotation(row: Row): ShiftRotation {
  return ShiftRotation.reconstitute({
    id: row.id,
    participantEmployeeIds: [row.participant_employee_ids[0]!, row.participant_employee_ids[1]!],
    patternA: {
      startTime: row.pattern_a_start_time.slice(0, 5),
      endTime: row.pattern_a_end_time.slice(0, 5),
      secondStartTime: row.pattern_a_second_start_time ? row.pattern_a_second_start_time.slice(0, 5) : null,
      secondEndTime: row.pattern_a_second_end_time ? row.pattern_a_second_end_time.slice(0, 5) : null,
    },
    patternB: {
      startTime: row.pattern_b_start_time.slice(0, 5),
      endTime: row.pattern_b_end_time.slice(0, 5),
      secondStartTime: row.pattern_b_second_start_time ? row.pattern_b_second_start_time.slice(0, 5) : null,
      secondEndTime: row.pattern_b_second_end_time ? row.pattern_b_second_end_time.slice(0, 5) : null,
    },
    locationId: row.location_id,
    anchorDate: row.anchor_date,
    autoSwitchWeekly: row.auto_switch_weekly,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function rotationToRow(rotation: ShiftRotation): Record<string, unknown> {
  const props = rotation.toProps();
  return {
    id: props.id,
    participant_employee_ids: props.participantEmployeeIds,
    pattern_a_start_time: props.patternA.startTime,
    pattern_a_end_time: props.patternA.endTime,
    pattern_a_second_start_time: props.patternA.secondStartTime,
    pattern_a_second_end_time: props.patternA.secondEndTime,
    pattern_b_start_time: props.patternB.startTime,
    pattern_b_end_time: props.patternB.endTime,
    pattern_b_second_start_time: props.patternB.secondStartTime,
    pattern_b_second_end_time: props.patternB.secondEndTime,
    location_id: props.locationId,
    anchor_date: props.anchorDate,
    auto_switch_weekly: props.autoSwitchWeekly,
    active: props.active,
    created_by: props.createdBy,
    updated_at: props.updatedAt,
  };
}

export class SupabaseShiftRotationRepository implements ShiftRotationRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findAll(organizationId: OrganizationId): Promise<ShiftRotation[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_shift_rotations")
      .select(SELECT)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as unknown as Row[]).map(rowToRotation);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<ShiftRotation | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_shift_rotations")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return rowToRotation(data as unknown as Row);
  }

  async create(organizationId: OrganizationId, rotation: ShiftRotation): Promise<ShiftRotation> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_shift_rotations")
      .insert(rotationToRow(rotation))
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToRotation(data as unknown as Row);
  }

  async update(organizationId: OrganizationId, rotation: ShiftRotation): Promise<ShiftRotation> {
    const { id, ...patch } = rotationToRow(rotation);
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_shift_rotations")
      .update(patch)
      .eq("id", id as string)
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);
    return rowToRotation(data as unknown as Row);
  }

  async delete(organizationId: OrganizationId, id: string): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("hr_shift_rotations").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}
