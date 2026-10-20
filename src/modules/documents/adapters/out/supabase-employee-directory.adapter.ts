import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { DocumentEmployee, EmployeeDirectoryPort } from "../../domain/ports/out/employee-directory.port.js";

const PAGE = 1000; // PostgREST max_rows
type Row = { id: string; full_name: string; nif: string | null; position_id: string | null };
const toEmployee = (r: Row): DocumentEmployee => ({ id: r.id, fullName: r.full_name, nif: r.nif, positionId: r.position_id });

/** Ficha partilhada `hr_employees` (fica sempre — ADR-0040), só leitura. */
export class SupabaseEmployeeDirectoryAdapter implements EmployeeDirectoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, id: string): Promise<DocumentEmployee | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_employees").select("id, full_name, nif, position_id").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEmployee(data as unknown as Row) : null;
  }

  async findMany(organizationId: OrganizationId, filter: { status: "active" | "all" }): Promise<DocumentEmployee[]> {
    const out: DocumentEmployee[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.scopedQuery(organizationId)
        .table("hr_employees")
        .select("id, full_name, nif, position_id")
        .order("full_name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (filter.status === "active") q = q.eq("status", "active");
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Row[];
      out.push(...rows.map(toEmployee));
      if (rows.length < PAGE) return out;
    }
  }

  async findLinkedEmployeeId(organizationId: OrganizationId, userId: string): Promise<string | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("hr_employees").select("id").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as { id: string } | null)?.id ?? null;
  }
}
