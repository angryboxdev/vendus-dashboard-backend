import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { PlanningAlert } from "../../domain/entities/planning-alert.js";
import type { PlanningAlertFilter, PlanningAlertRepositoryPort } from "../../domain/ports/out/planning-alert-repository.port.js";

export class FakePlanningAlertRepository implements PlanningAlertRepositoryPort {
  alerts = new Map<string, PlanningAlert>();

  async findByFingerprint(_organizationId: OrganizationId, fingerprint: string): Promise<PlanningAlert | null> {
    return [...this.alerts.values()].find((a) => a.fingerprint === fingerprint) ?? null;
  }

  async findById(_organizationId: OrganizationId, id: string): Promise<PlanningAlert | null> {
    return this.alerts.get(id) ?? null;
  }

  async findAll(_organizationId: OrganizationId, filter?: PlanningAlertFilter): Promise<PlanningAlert[]> {
    return [...this.alerts.values()].filter((a) => {
      const p = a.toProps();
      if (filter?.state && p.state !== filter.state) return false;
      if (filter?.locationId && p.locationId !== filter.locationId) return false;
      if (filter?.alertType && p.alertType !== filter.alertType) return false;
      return true;
    });
  }

  async findStaleActiveAlerts(_organizationId: OrganizationId, locationId: string, stillPresentFingerprints: string[]): Promise<PlanningAlert[]> {
    const present = new Set(stillPresentFingerprints);
    return [...this.alerts.values()].filter((a) => {
      const p = a.toProps();
      return p.locationId === locationId && (p.state === "active" || p.state === "acknowledged") && !present.has(a.fingerprint);
    });
  }

  async upsert(_organizationId: OrganizationId, alert: PlanningAlert): Promise<void> {
    this.alerts.set(alert.id, alert);
  }

  async upsertMany(_organizationId: OrganizationId, alerts: PlanningAlert[]): Promise<void> {
    for (const alert of alerts) this.alerts.set(alert.id, alert);
  }
}
