import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ClockEvent, ClockRevision } from "../../entities/clock.js";
import type { Adjustment, CorrectionRequest, DayVersion, Incident, IncidentStatus } from "../../entities/records.js";
import type { DayPlan, EngineRules, IncidentType } from "../../services/day-engine.js";
import type { PunchPolicy } from "../../services/punch-policy.js";

export interface AttendanceRepositoryPort {
  /** RE-9: com o mesmo `clientEventId` devolve a marcação já gravada (`duplicate: true`). */
  insertEvent(org: OrganizationId, e: Omit<ClockEvent, "id">): Promise<{ event: ClockEvent; duplicate: boolean }>;
  findEventByClientId(org: OrganizationId, employeeId: string, clientEventId: string): Promise<ClockEvent | null>;
  getEvent(org: OrganizationId, id: string): Promise<ClockEvent | null>;
  listEvents(org: OrganizationId, employeeId: string, fromUtc: string, toUtc: string): Promise<ClockEvent[]>;

  insertRevision(org: OrganizationId, r: Omit<ClockRevision, "id" | "createdAt"> & { before: unknown }): Promise<ClockRevision>;
  getRevision(org: OrganizationId, id: string): Promise<ClockRevision | null>;
  /** Revisões cujo instante (`anchorAt`) cai no período. */
  listRevisions(org: OrganizationId, employeeId: string, fromUtc: string, toUtc: string): Promise<ClockRevision[]>;
  refuseRevision(org: OrganizationId, id: string, comment: string | null): Promise<ClockRevision>;
  /** RE-11: revisões ativas ainda dentro do prazo de recusa (qualquer dia). */
  listRefusableRevisions(org: OrganizationId, employeeId: string, now: string): Promise<ClockRevision[]>;

  insertCorrection(org: OrganizationId, c: Omit<CorrectionRequest, "id" | "status" | "decidedBy" | "decidedAt" | "decisionComment" | "revisionId" | "createdAt">): Promise<CorrectionRequest>;
  getCorrection(org: OrganizationId, id: string): Promise<CorrectionRequest | null>;
  listCorrections(org: OrganizationId, filter: { status?: CorrectionRequest["status"]; employeeId?: string }): Promise<CorrectionRequest[]>;
  decideCorrection(org: OrganizationId, id: string, d: { status: "approved" | "rejected"; decidedBy: string; comment: string | null; revisionId: string | null }): Promise<CorrectionRequest>;

  currentDays(org: OrganizationId, employeeId: string, from: string, to: string): Promise<DayVersion[]>;
  /** A anterior deixa de ser a atual; a nova fica com `version` = anterior + 1. */
  insertDayVersion(org: OrganizationId, d: Omit<DayVersion, "calculatedAt">): Promise<DayVersion>;
  insertAdjustment(org: OrganizationId, a: Omit<Adjustment, "id" | "createdAt">): Promise<Adjustment>;
  listAdjustments(org: OrganizationId, employeeId: string, from: string, to: string): Promise<Adjustment[]>;

  /** RE-14: ignora o que já existe para (colaborador, dia, tipo, origem). */
  ensureIncidents(org: OrganizationId, items: { employeeId: string; workDate: string; type: IncidentType }[]): Promise<void>;
  getIncident(org: OrganizationId, id: string): Promise<Incident | null>;
  listIncidents(org: OrganizationId, filter: { status?: IncidentStatus; employeeId?: string; from: string; to: string }): Promise<Incident[]>;
  resolveIncident(org: OrganizationId, id: string, r: { status: Exclude<IncidentStatus, "open">; comment: string | null; resolvedBy: string }): Promise<Incident>;

  enqueue(org: OrganizationId, employeeId: string, dates: string[]): Promise<void>;
  takeQueue(org: OrganizationId, limit: number): Promise<{ employeeId: string; workDate: string }[]>;
}

/** Regras efetivas de um colaborador numa data (vêm do módulo settings). */
export interface AttendanceConfig {
  rules: EngineRules;
  policy: PunchPolicy;
  /** RE-11: o colaborador pode recusar correções da gestão (prazo em horas). */
  refusal: { enabled: boolean; hours: number };
}

/** O que a assiduidade precisa de outros módulos (ligado no composition root). */
export interface AttendanceContextPort {
  employeeForUser(org: OrganizationId, userId: string): Promise<string | null>;
  timeZone(org: OrganizationId): Promise<string>;
  config(org: OrganizationId, employeeId: string, date: string, timeZone: string): Promise<AttendanceConfig>;
  /** Plano diário (teórico, entrada/saída planeadas, noturno, feriado) — módulo time-base. */
  plans(org: OrganizationId, employeeId: string, from: string, to: string): Promise<Map<string, DayPlan>>;
  /** Centro onde pica: o indicado ou o principal da ficha. null = sem centro. */
  punchLocation(org: OrganizationId, employeeId: string, locationId: string | null): Promise<{ id: string; latitude: number | null; longitude: number | null; radiusMeters: number } | null>;
}

export interface AttendanceAuditPort {
  record(
    org: OrganizationId,
    e: { actor: string; action: string; resourceType: string; resourceId: string | null; before: unknown; after: unknown; reason: string | null },
  ): Promise<void>;
}

export interface AttendanceClockPort {
  now(): string;
}

/** Recálculo em segundo plano (setImmediate em produção; síncrono nos testes). */
export interface BackgroundPort {
  run(task: () => Promise<void>): void;
}

/** Períodos fechados (módulo periods): datas congeladas para um colaborador (TK-17). */
export interface PeriodGuardPort {
  closedDates(org: OrganizationId, employeeId: string, from: string, to: string): Promise<Set<string>>;
}
