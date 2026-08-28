import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { Employee, EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";

/**
 * Never holds a `SupabaseClient` — receives the scoped-query factory at
 * composition time (D2) and builds a scoped helper per call.
 *
 * `findActiveByPinHash` is the PIN lookup ticket 03 scopes: it used to
 * search every employee in the database, which was correct by construction
 * while one organization existed. Scoped, it stays correct by construction —
 * the four-digit collision hazard across organizations is spec A's deferred
 * item, not fixed here.
 */
export class SupabaseEmployeeRepository implements EmployeeRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findActiveByPinHash(organizationId: OrganizationId, pinHash: string): Promise<Employee | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employees")
      .select("id, full_name")
      .eq("kiosk_pin_hash", pinHash)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as unknown as Record<string, unknown>;
    return { id: row.id as string, fullName: row.full_name as string };
  }

  async findActiveById(organizationId: OrganizationId, id: string): Promise<Employee | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employees")
      .select("id, full_name")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as unknown as Record<string, unknown>;
    return { id: row.id as string, fullName: row.full_name as string };
  }
}
