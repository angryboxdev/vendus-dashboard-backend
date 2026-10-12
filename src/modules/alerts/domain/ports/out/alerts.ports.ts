import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Alert, AlertKind, AlertRule, AlertRuleInput, Candidate } from "../../entities/alert.js";

export interface AlertsRepositoryPort {
  listRules(org: OrganizationId): Promise<AlertRule[]>;
  createRule(org: OrganizationId, r: AlertRuleInput, by: string): Promise<AlertRule>;
  updateRule(org: OrganizationId, id: string, r: AlertRuleInput): Promise<AlertRule>;
  listAlerts(org: OrganizationId, f: { status?: Alert["status"] | "active" }): Promise<Alert[]>;
  getAlert(org: OrganizationId, id: string): Promise<Alert | null>;
  /** Cria se não houver um aberto para (regra, origem); devolve null se já existia. */
  openAlert(org: OrganizationId, a: Pick<Alert, "ruleId" | "sourceType" | "sourceId" | "employeeId" | "title" | "ownerUserIds" | "dueAt">): Promise<Alert | null>;
  updateAlert(org: OrganizationId, id: string, expected: Alert["status"][], patch: Partial<Pick<Alert, "status" | "escalatedAt" | "escalatedTo" | "ownerUserIds" | "takenBy" | "closedBy" | "closedAt" | "closeNote">>): Promise<Alert | null>;
}

export interface AlertsContextPort {
  /** Origens possíveis para um tipo de alerta (pendentes, contratos a terminar, tarefas em atraso…). */
  candidates(org: OrganizationId, kind: AlertKind): Promise<Candidate[]>;
  resolveOwner(org: OrganizationId, owner: string): Promise<string[]>;
  notify(org: OrganizationId, userIds: string[], n: { title: string; body: string; link: string; dedupeKey: string }): Promise<void>;
  now(): string;
  audit(org: OrganizationId, e: { actor: string; action: string; resourceId: string; after: unknown; reason: string | null }): Promise<void>;
}
