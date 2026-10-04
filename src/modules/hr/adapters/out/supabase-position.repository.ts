import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { JobRole } from "../../domain/entities/employee.js";
import { Position } from "../../domain/entities/position.js";
import { DuplicatePositionNameError } from "../../domain/errors.js";
import type { PositionRepositoryPort } from "../../domain/ports/out/position-repository.port.js";

const SELECT = "id, name, description, operational_category, active, created_at, updated_at";

interface Row {
  id: string;
  name: string;
  description: string | null;
  operational_category: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

function toEntity(row: Row): Position {
  return Position.reconstitute({
    id: row.id,
    name: row.name,
    description: row.description,
    operationalCategory: row.operational_category as JobRole,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/** `normalized_name` é coluna gerada — nunca escrita aqui. */
function toRow(position: Position): Omit<Row, "id" | "created_at"> {
  const p = position.toProps();
  return {
    name: p.name,
    description: p.description,
    operational_category: p.operationalCategory,
    active: p.active,
    updated_at: p.updatedAt,
  };
}

/** `unique (org_id, normalized_name)` é a única restrição única que uma escrita pode violar. */
function throwWriteError(error: { code?: string; message: string }, position: Position): never {
  if (error.code === "23505") throw new DuplicatePositionNameError(position.name);
  throw new Error(error.message);
}

export class SupabasePositionRepository implements PositionRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findAll(organizationId: OrganizationId): Promise<Position[]> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_positions").select(SELECT).order("name");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toEntity);
  }

  async findById(organizationId: OrganizationId, id: string): Promise<Position | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_positions")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as Row) : null;
  }

  async insert(organizationId: OrganizationId, position: Position): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("hr_positions")
      .insert({ id: position.id, created_at: position.toProps().createdAt, ...toRow(position) });
    if (error) throwWriteError(error, position);
  }

  async update(organizationId: OrganizationId, position: Position): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("hr_positions").update(toRow(position)).eq("id", position.id);
    if (error) throwWriteError(error, position);
  }
}
