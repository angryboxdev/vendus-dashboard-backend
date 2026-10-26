import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { EmployeeDirectoryReadPort, RecurrenceEmployee } from "../../domain/ports/out/employee-directory-read.port.js";

const PAGE = 1000; // PostgREST max_rows
const SELECT = "id, full_name, status";
type Row = { id: string; full_name: string; status: string };
const toEmployee = (r: Row): RecurrenceEmployee => ({
  id: r.id,
  fullName: r.full_name,
  status: r.status === "active" ? "active" : "inactive",
});

/**
 * Cross-módulo: lê `hr_employees` diretamente (só id, nome e estado), sem importar
 * código do RH. Via `ScopedQueryFactory`, como os restantes adapters do módulo.
 */
export class SupabaseEmployeeDirectoryReadAdapter implements EmployeeDirectoryReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findById(organizationId: OrganizationId, id: string): Promise<RecurrenceEmployee | null> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table("hr_employees")
      .select(SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEmployee(data as unknown as Row) : null;
  }

  async findAll(organizationId: OrganizationId): Promise<RecurrenceEmployee[]> {
    const out: RecurrenceEmployee[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.scopedQuery(organizationId)
        .table("hr_employees")
        .select(SELECT)
        .order("full_name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as Row[];
      out.push(...rows.map(toEmployee));
      if (rows.length < PAGE) return out;
    }
  }
}
