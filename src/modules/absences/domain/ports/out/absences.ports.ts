import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { AbsenceType, AbsenceTypeInput, VacationRules } from "../../entities/absence-type.js";
import type { ApprovalFlow, ApprovalFlowInput } from "../../entities/approval-flow.js";
import type { AbsenceRequest, ApprovalDecision, LedgerEntry, RequestStatus } from "../../entities/request.js";
import type { PlanDay } from "../../services/absence-calc.js";

export interface AbsencesRepositoryPort {
  listTypes(org: OrganizationId): Promise<AbsenceType[]>;
  createType(org: OrganizationId, t: AbsenceTypeInput, by: string): Promise<AbsenceType>;
  updateType(org: OrganizationId, id: string, t: AbsenceTypeInput): Promise<AbsenceType>;
  archiveType(org: OrganizationId, id: string): Promise<void>;

  listFlows(org: OrganizationId): Promise<ApprovalFlow[]>;
  createFlow(org: OrganizationId, f: ApprovalFlowInput, by: string): Promise<ApprovalFlow>;
  updateFlow(org: OrganizationId, id: string, f: ApprovalFlowInput): Promise<ApprovalFlow>;
  archiveFlow(org: OrganizationId, id: string): Promise<void>;
  /** Tira o "por omissão" aos outros fluxos do mesmo âmbito. */
  clearDefault(org: OrganizationId, scope: ApprovalFlow["scope"], exceptId: string): Promise<void>;

  insertRequest(org: OrganizationId, r: Omit<AbsenceRequest, "id" | "createdAt" | "decidedAt" | "cancelReason">): Promise<AbsenceRequest>;
  getRequest(org: OrganizationId, id: string): Promise<AbsenceRequest | null>;
  listRequests(org: OrganizationId, f: { status?: RequestStatus; employeeId?: string; from?: string; to?: string }): Promise<AbsenceRequest[]>;
  /** Atualização condicionada ao estado atual (concorrência: dois aprovadores ao mesmo tempo). */
  updateRequest(
    org: OrganizationId,
    id: string,
    expected: { status: RequestStatus; currentLevel: number },
    patch: Partial<Pick<AbsenceRequest, "status" | "currentLevel" | "decidedAt" | "cancelReason">>,
  ): Promise<AbsenceRequest | null>;

  insertDecision(org: OrganizationId, d: Omit<ApprovalDecision, "id" | "createdAt">): Promise<ApprovalDecision>;
  listDecisions(org: OrganizationId, requestId: string): Promise<ApprovalDecision[]>;

  /** Movimento de saldo. Acumulação/compensação repetidas (índice único) → null. */
  insertEntry(org: OrganizationId, e: Omit<LedgerEntry, "id" | "createdAt">): Promise<LedgerEntry | null>;
  listEntries(org: OrganizationId, f: { employeeId: string; typeId?: string; period?: string }): Promise<LedgerEntry[]>;
}

/** O que as ausências precisam de outros módulos (ligado no composition root). */
export interface AbsencesContextPort {
  employeeForUser(org: OrganizationId, userId: string): Promise<string | null>;
  userOfEmployee(org: OrganizationId, employeeId: string): Promise<string | null>;
  /** TK-14: contrato ativo em todos os dias do intervalo; e o início do contrato (antiguidade, ano de trabalho). */
  contractCoverage(org: OrganizationId, employeeId: string, from: string, to: string): Promise<{ covered: boolean; contractStart: string | null }>;
  planDays(org: OrganizationId, employeeId: string, from: string, to: string): Promise<PlanDay[]>;
  vacationRulesFor(org: OrganizationId, employeeId: string, date: string): Promise<VacationRules | null>;
  managerUserIds(org: OrganizationId, employeeId: string, date: string): Promise<string[]>;
  profileUserIds(org: OrganizationId, profileId: string): Promise<string[]>;
  adminUserIds(org: OrganizationId): Promise<string[]>;
  /** Feriado confirmado do colaborador nesse dia, com coeficiente e opção de aprovação (CF-9). */
  holidayOn(org: OrganizationId, employeeId: string, date: string): Promise<{ name: string; coefficient: number; approvalRequired: boolean } | null>;
  workedSeconds(org: OrganizationId, employeeId: string, date: string): Promise<number>;
}

export interface AbsencesNotifierPort {
  notify(org: OrganizationId, userIds: string[], n: { title: string; body: string; link: string; dedupeKey: string }): Promise<void>;
}

export interface AbsencesAuditPort {
  record(
    org: OrganizationId,
    e: { actor: string; action: string; resourceType: string; resourceId: string | null; before: unknown; after: unknown; reason: string | null },
  ): Promise<void>;
}

export interface AbsencesClockPort {
  today(org: OrganizationId): Promise<string>;
}

/** Períodos fechados (módulo periods): datas congeladas para um colaborador (TK-17). */
export interface PeriodGuardPort {
  closedDates(org: OrganizationId, employeeId: string, from: string, to: string): Promise<Set<string>>;
}
