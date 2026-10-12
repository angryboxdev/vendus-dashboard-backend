import { DateTime } from "luxon";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Ficha da conta, fuso da organização e centro de marcação — leituras de tabelas de outros módulos. */
export class SupabaseAttendanceDirectory {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async employeeForUser(org: OrganizationId, userId: string): Promise<string | null> {
    const r = check<Row | null>(await this.scoped(org).table("hr_employees").select("id").eq("user_id", userId).maybeSingle());
    return r ? String(r.id) : null;
  }

  async timeZone(org: OrganizationId): Promise<string> {
    const r = check<Row | null>(await this.scoped(org).table("organizations").select("timezone").maybeSingle());
    const tz = typeof r?.timezone === "string" ? r.timezone : "";
    return tz && DateTime.local().setZone(tz).isValid ? tz : "Europe/Lisbon";
  }

  async punchLocation(org: OrganizationId, employeeId: string, locationId: string | null) {
    let id = locationId;
    if (!id) {
      const e = check<Row | null>(await this.scoped(org).table("hr_employees").select("primary_location_id").eq("id", employeeId).maybeSingle());
      id = e?.primary_location_id ? String(e.primary_location_id) : null;
    }
    if (!id) return null;
    const l = check<Row | null>(await this.scoped(org).table("locations").select("id, latitude, longitude, geofence_radius_m").eq("id", id).maybeSingle());
    if (!l) return null;
    return {
      id: String(l.id),
      latitude: l.latitude === null || l.latitude === undefined ? null : Number(l.latitude),
      longitude: l.longitude === null || l.longitude === undefined ? null : Number(l.longitude),
      radiusMeters: Number(l.geofence_radius_m ?? 100),
    };
  }
}
