import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { PlanningAlert, PlanningAlertState, PlanningAlertType } from "../../entities/planning-alert.js";

export interface PlanningAlertFilter {
  state?: PlanningAlertState;
  locationId?: string;
  alertType?: PlanningAlertType;
}

/** Upsert por fingerprint (secção 72-73) — nunca cria uma 2ª linha para a mesma condição. */
export interface PlanningAlertRepositoryPort {
  findByFingerprint(organizationId: OrganizationId, fingerprint: string): Promise<PlanningAlert | null>;
  findById(organizationId: OrganizationId, id: string): Promise<PlanningAlert | null>;
  findAll(organizationId: OrganizationId, filter?: PlanningAlertFilter): Promise<PlanningAlert[]>;
  /** Alertas ativos/reconhecidos de um run anterior cujo fingerprint não está na lista `stillPresentFingerprints` — candidatos a auto-resolve. */
  findStaleActiveAlerts(organizationId: OrganizationId, locationId: string, stillPresentFingerprints: string[]): Promise<PlanningAlert[]>;
  upsert(organizationId: OrganizationId, alert: PlanningAlert): Promise<void>;
  upsertMany(organizationId: OrganizationId, alerts: PlanningAlert[]): Promise<void>;
}
