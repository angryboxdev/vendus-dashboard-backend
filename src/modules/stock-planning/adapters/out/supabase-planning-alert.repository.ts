import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import { PlanningAlert, type PlanningAlertSeverity, type PlanningAlertState, type PlanningAlertType } from "../../domain/entities/planning-alert.js";
import type { PlanningAlertFilter, PlanningAlertRepositoryPort } from "../../domain/ports/out/planning-alert-repository.port.js";

interface Row {
  id: string;
  location_id: string;
  item_id: string;
  alert_type: PlanningAlertType;
  fingerprint: string;
  severity: PlanningAlertSeverity;
  state: PlanningAlertState;
  first_detected_at: string;
  last_updated_at: string;
  resolved_at: string | null;
  silenced_until: string | null;
  context_snapshot: Record<string, unknown> | null;
}

function toEntity(organizationId: OrganizationId, row: Row): PlanningAlert {
  return PlanningAlert.reconstitute({
    id: row.id,
    organizationId,
    locationId: row.location_id,
    itemId: row.item_id,
    alertType: row.alert_type,
    fingerprint: row.fingerprint,
    severity: row.severity,
    state: row.state,
    firstDetectedAt: new Date(row.first_detected_at),
    lastUpdatedAt: new Date(row.last_updated_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    silencedUntil: row.silenced_until ? new Date(row.silenced_until) : null,
    contextSnapshot: row.context_snapshot ?? {},
  });
}

function toRow(alert: PlanningAlert): Record<string, unknown> {
  const p = alert.toProps();
  return {
    id: p.id,
    location_id: p.locationId,
    item_id: p.itemId,
    alert_type: p.alertType,
    fingerprint: p.fingerprint,
    severity: p.severity,
    state: p.state,
    first_detected_at: p.firstDetectedAt.toISOString(),
    last_updated_at: p.lastUpdatedAt.toISOString(),
    resolved_at: p.resolvedAt ? p.resolvedAt.toISOString() : null,
    silenced_until: p.silencedUntil ? p.silencedUntil.toISOString() : null,
    context_snapshot: p.contextSnapshot,
  };
}

/** Upsert por fingerprint (`UNIQUE(org_id, location_id, item_id, alert_type)`) — nunca duplica a mesma condição (secção 72-73). */
export class SupabasePlanningAlertRepository implements PlanningAlertRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findByFingerprint(organizationId: OrganizationId, fingerprint: string): Promise<PlanningAlert | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("planning_alerts").select("*").eq("fingerprint", fingerprint).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(organizationId, data as unknown as Row) : null;
  }

  async findById(organizationId: OrganizationId, id: string): Promise<PlanningAlert | null> {
    const { data, error } = await this.scopedQuery(organizationId).table("planning_alerts").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(organizationId, data as unknown as Row) : null;
  }

  async findAll(organizationId: OrganizationId, filter?: PlanningAlertFilter): Promise<PlanningAlert[]> {
    let q = this.scopedQuery(organizationId).table("planning_alerts").select("*");
    if (filter?.state) q = q.eq("state", filter.state);
    if (filter?.locationId) q = q.eq("location_id", filter.locationId);
    if (filter?.alertType) q = q.eq("alert_type", filter.alertType);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map((r) => toEntity(organizationId, r));
  }

  async findStaleActiveAlerts(organizationId: OrganizationId, locationId: string, stillPresentFingerprints: string[]): Promise<PlanningAlert[]> {
    let q = this.scopedQuery(organizationId)
      .table("planning_alerts")
      .select("*")
      .eq("location_id", locationId)
      .in("state", ["active", "acknowledged"]);
    if (stillPresentFingerprints.length > 0) q = q.not("fingerprint", "in", `(${stillPresentFingerprints.join(",")})`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map((r) => toEntity(organizationId, r));
  }

  async upsert(organizationId: OrganizationId, alert: PlanningAlert): Promise<void> {
    const { error } = await this.scopedQuery(organizationId).table("planning_alerts").upsert(toRow(alert), { onConflict: "org_id,location_id,item_id,alert_type" });
    if (error) throw new Error(error.message);
  }

  async upsertMany(organizationId: OrganizationId, alerts: PlanningAlert[]): Promise<void> {
    if (alerts.length === 0) return;
    const { error } = await this.scopedQuery(organizationId)
      .table("planning_alerts")
      .upsert(alerts.map(toRow), { onConflict: "org_id,location_id,item_id,alert_type" });
    if (error) throw new Error(error.message);
  }
}
