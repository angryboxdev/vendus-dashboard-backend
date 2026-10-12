import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Closure, EmployeeTotals, ExportJob, PayPeriod, PendingItem, Reopening } from "../../entities/period.js";
import type { EmployeeInfo } from "../../services/csv-export.js";

export interface PeriodsRepositoryPort {
  listPeriods(org: OrganizationId): Promise<PayPeriod[]>;
  createPeriod(org: OrganizationId, p: Omit<PayPeriod, "id" | "status">, by: string): Promise<PayPeriod>;
  /** Muda o estado só se ainda for `expected`. */
  setStatus(org: OrganizationId, id: string, expected: PayPeriod["status"][], status: PayPeriod["status"]): Promise<boolean>;
  listClosures(org: OrganizationId, periodId: string): Promise<Closure[]>;
  insertClosure(org: OrganizationId, c: Omit<Closure, "id" | "createdAt">): Promise<Closure>;
  listReopenings(org: OrganizationId, periodId?: string): Promise<Reopening[]>;
  getReopening(org: OrganizationId, id: string): Promise<Reopening | null>;
  insertReopening(org: OrganizationId, r: Omit<Reopening, "id" | "approvals" | "status" | "createdAt">): Promise<Reopening>;
  updateReopening(org: OrganizationId, id: string, expectedApprovals: number, patch: Pick<Reopening, "approvals" | "status">): Promise<Reopening | null>;
  insertExport(org: OrganizationId, j: Pick<ExportJob, "periodId" | "kind" | "requestedBy" | "requestedByUserId" | "includeSensitive">): Promise<ExportJob>;
  updateExport(org: OrganizationId, id: string, patch: Partial<Pick<ExportJob, "status" | "error" | "fileName" | "totals" | "expiresAt">> & { content?: string; token?: string }): Promise<void>;
  listExports(org: OrganizationId, userId: string): Promise<ExportJob[]>;
  getExportFile(org: OrganizationId, id: string): Promise<{ job: ExportJob; content: string | null; token: string | null } | null>;
}

/** O que os períodos precisam dos outros módulos (ligado no composition root). */
export interface PeriodsContextPort {
  employeesInScope(org: OrganizationId, period: PayPeriod): Promise<string[]>;
  employeeLocations(org: OrganizationId, employeeId: string, date: string): Promise<string[]>;
  pendingItems(org: OrganizationId, employeeIds: string[], from: string, to: string): Promise<PendingItem[]>;
  /** Recalcula a assiduidade e sincroniza o banco antes de fechar. */
  prepare(org: OrganizationId, employeeId: string, from: string, to: string): Promise<void>;
  totals(org: OrganizationId, employeeId: string, from: string, to: string): Promise<EmployeeTotals>;
  employeeInfo(org: OrganizationId, employeeIds: string[]): Promise<EmployeeInfo[]>;
  locationName(org: OrganizationId, locationId: string | null): Promise<string>;
}

export interface PeriodsSupportPort {
  token(): string;
  now(): string;
  background(task: () => Promise<void>): void;
}

export interface PeriodsAuditPort {
  record(
    org: OrganizationId,
    e: { actor: string; action: string; resourceType: string; resourceId: string | null; before: unknown; after: unknown; reason: string | null },
  ): Promise<void>;
}
