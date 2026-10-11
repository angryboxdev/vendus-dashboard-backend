import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Contas ↔ fichas e titulares de perfis (tabelas de outros módulos, só leitura). */
export class SupabaseAbsencesDirectory {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async employeeForUser(org: OrganizationId, userId: string): Promise<string | null> {
    const r = check<Row | null>(await this.scoped(org).table("hr_employees").select("id").eq("user_id", userId).maybeSingle());
    return r ? String(r.id) : null;
  }

  async userOfEmployee(org: OrganizationId, employeeId: string): Promise<string | null> {
    const r = check<Row | null>(await this.scoped(org).table("hr_employees").select("user_id").eq("id", employeeId).maybeSingle());
    return r?.user_id ? String(r.user_id) : null;
  }

  async usersOfEmployees(org: OrganizationId, employeeIds: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const id of [...new Set(employeeIds)]) {
      const u = await this.userOfEmployee(org, id);
      if (u) out.push(u);
    }
    return out;
  }

  async profileUserIds(org: OrganizationId, profileId: string): Promise<string[]> {
    const rows = check<Row[]>(await this.scoped(org).table("org_members").select("user_id").eq("profile_id", profileId));
    return rows.map((r) => String(r.user_id));
  }
}

/** Contratos ativos cobrem todos os dias de [from, to]? (TK-14) e a data de início/antiguidade. */
export function coverage(contracts: { startDate: string; endDate: string | null; seniorityDate: string | null; status: string }[], from: string, to: string) {
  const active = contracts.filter((c) => c.status === "active").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const contractStart = active.length ? active.map((c) => c.seniorityDate ?? c.startDate).sort()[0]! : null;
  let cursor = from;
  for (const c of active) {
    if (c.startDate > cursor) break;
    if (c.endDate === null) return { covered: true, contractStart };
    if (c.endDate >= cursor) {
      if (c.endDate >= to) return { covered: true, contractStart };
      const next = new Date(`${c.endDate}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      cursor = next.toISOString().slice(0, 10);
    }
  }
  return { covered: false, contractStart };
}
