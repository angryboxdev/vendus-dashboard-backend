import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { CoverageRulesRepositoryPort } from "../../domain/ports/out/coverage.ports.js";
import type { CoverageRule, CoverageRuleInput } from "../../domain/services/coverage.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const COV = "id, location_id, area_id, weekday, on_date, start_time, end_time, min_people";
/** `time` do Postgres vem como "HH:MM:SS". */
const hm = (v: unknown) => String(v).slice(0, 5);
const toRule = (r: Row): CoverageRule => ({
  id: String(r.id),
  locationId: String(r.location_id),
  areaId: r.area_id === null || r.area_id === undefined ? null : String(r.area_id),
  weekday: r.weekday === null || r.weekday === undefined ? null : Number(r.weekday),
  date: r.on_date === null || r.on_date === undefined ? null : String(r.on_date).slice(0, 10),
  start: hm(r.start_time),
  end: hm(r.end_time),
  minPeople: Number(r.min_people),
});

export class SupabaseCoverageRulesRepository implements CoverageRulesRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async listCoverageRules(org: OrganizationId, locationId?: string | null) {
    let q = this.scoped(org).table("coverage_rules").select(COV);
    if (locationId) q = q.eq("location_id", locationId);
    return check<Row[]>(await q.order("on_date", { nullsFirst: true }).order("weekday").order("start_time")).map(toRule);
  }
  async createCoverageRule(org: OrganizationId, r: CoverageRuleInput, by: string) {
    const row = { location_id: r.locationId, area_id: r.areaId, weekday: r.weekday, on_date: r.date, start_time: r.start, end_time: r.end, min_people: r.minPeople, created_by: by };
    return toRule(check(await this.scoped(org).table("coverage_rules").insert(row).select(COV).single()));
  }
  async updateCoverageRule(org: OrganizationId, id: string, patch: Partial<Pick<CoverageRule, "start" | "end" | "minPeople">>) {
    const row: Row = { updated_at: new Date().toISOString() };
    if (patch.start !== undefined) row.start_time = patch.start;
    if (patch.end !== undefined) row.end_time = patch.end;
    if (patch.minPeople !== undefined) row.min_people = patch.minPeople;
    return toRule(check(await this.scoped(org).table("coverage_rules").update(row).eq("id", id).select(COV).single()));
  }
  async deleteCoverageRule(org: OrganizationId, id: string) {
    check(await this.scoped(org).table("coverage_rules").delete().eq("id", id));
  }
}
