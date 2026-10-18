import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Publication, Roster, RosterShift, ShiftState, ShiftTemplate, ShiftTemplateInput, Swap } from "../../entities/roster.js";
import type { Rules } from "../../services/constraints.js";

export interface RostersRepositoryPort {
  listTemplates(org: OrganizationId): Promise<ShiftTemplate[]>;
  createTemplate(org: OrganizationId, t: ShiftTemplateInput, by: string): Promise<ShiftTemplate>;
  archiveTemplate(org: OrganizationId, id: string): Promise<void>;
  /** Só a cor (a mesma na escala); as faixas de um modelo não mudam depois de criado. */
  setTemplateColor(org: OrganizationId, id: string, color: string | null): Promise<ShiftTemplate>;

  listRosters(org: OrganizationId): Promise<Roster[]>;
  createRoster(org: OrganizationId, r: Pick<Roster, "name" | "targetType" | "targetId">, by: string): Promise<Roster>;
  archiveRoster(org: OrganizationId, id: string): Promise<void>;
  /** Avança a versão só se ainda for `expected` (duas publicações ao mesmo tempo). */
  bumpVersion(org: OrganizationId, id: string, expected: number): Promise<boolean>;

  listShifts(org: OrganizationId, f: { rosterId?: string; employeeIds?: string[]; from: string; to: string; includeDeleted?: boolean }): Promise<RosterShift[]>;
  getShift(org: OrganizationId, id: string): Promise<RosterShift | null>;
  insertShifts(org: OrganizationId, rows: (ShiftState & { rosterId: string })[], by: string): Promise<RosterShift[]>;
  updateShift(org: OrganizationId, id: string, patch: Partial<Pick<RosterShift, "kind" | "segments" | "templateId" | "onCall" | "deleted" | "dirty" | "published" | "publishedVersion" | "employeeId">>, by: string): Promise<RosterShift>;

  /**
   * Retira de uma vez (uma só instrução) os turnos nunca publicados de um
   * colaborador nesta escala e período (opcionalmente só estes ids).
   * Devolve os retirados.
   */
  clearPending(org: OrganizationId, f: { rosterId: string; employeeId: string; from: string; to: string; ids?: string[] }, by: string): Promise<RosterShift[]>;
  /** Repõe turnos nunca publicados que tinham sido retirados (desfazer). Devolve os repostos. */
  restoreShifts(org: OrganizationId, rosterId: string, ids: string[], by: string): Promise<RosterShift[]>;

  insertPublication(org: OrganizationId, p: Omit<Publication, "id" | "createdAt">): Promise<Publication>;
  listPublications(org: OrganizationId, rosterId: string): Promise<Publication[]>;

  insertSwap(org: OrganizationId, s: Omit<Swap, "id" | "status" | "decidedBy" | "createdAt">): Promise<Swap>;
  getSwap(org: OrganizationId, id: string): Promise<Swap | null>;
  listSwaps(org: OrganizationId, f: { status?: Swap["status"]; employeeId?: string }): Promise<Swap[]>;
  updateSwap(org: OrganizationId, id: string, expected: Swap["status"], patch: { status: Swap["status"]; decidedBy?: string; comment?: string | null }): Promise<Swap | null>;
}

export interface RostersContextPort {
  /** Regras em vigor para um colaborador numa data (parâmetros com cascata). */
  rules(org: OrganizationId, employeeId: string, date: string): Promise<Rules>;
  approvedAbsenceDates(org: OrganizationId, employeeId: string, from: string, to: string): Promise<string[]>;
  employeeForUser(org: OrganizationId, userId: string): Promise<string | null>;
  userOfEmployee(org: OrganizationId, employeeId: string): Promise<string | null>;
  /** «Mostrar os turnos dos colegas» (`security.visibility.coworkers_shifts`, desligado por omissão — ADR-0030). */
  coworkersVisible(org: OrganizationId, employeeId: string, date: string): Promise<boolean>;
  /** Só o necessário para mostrar um colega: nome, cargo e se está ativo (nunca contactos). */
  peopleBrief(org: OrganizationId, employeeIds: string[]): Promise<{ id: string; fullName: string; positionName: string | null; active: boolean }[]>;
}

export interface RostersNotifierPort {
  notify(org: OrganizationId, userIds: string[], n: { title: string; body: string; link: string; dedupeKey: string }): Promise<void>;
}

/** Depois de publicar: pedir o recálculo da assiduidade dos dias afetados. */
export interface RosterPublishedPort {
  published(org: OrganizationId, changes: { employeeId: string; workDate: string }[]): void;
}

export interface RostersAuditPort {
  record(
    org: OrganizationId,
    e: { actor: string; action: string; resourceType: string; resourceId: string | null; before: unknown; after: unknown; reason: string | null },
  ): Promise<void>;
}

/** Períodos fechados (módulo periods): datas congeladas para um colaborador (TK-17). */
export interface PeriodGuardPort {
  closedDates(org: OrganizationId, employeeId: string, from: string, to: string): Promise<Set<string>>;
}
