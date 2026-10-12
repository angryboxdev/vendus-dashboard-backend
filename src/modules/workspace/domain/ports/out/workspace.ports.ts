import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { CustomRequest, OpsTask, Presence, RequestForm, RequestFormInput } from "../../entities/workspace.js";

export interface WorkspaceRepositoryPort {
  listTasks(org: OrganizationId, f: { status?: OpsTask["status"]; assigneeEmployeeId?: string }): Promise<OpsTask[]>;
  getTask(org: OrganizationId, id: string): Promise<OpsTask | null>;
  createTask(org: OrganizationId, t: Omit<OpsTask, "id" | "status" | "completedBy" | "completedAt" | "createdAt">, by: string): Promise<OpsTask>;
  updateTask(org: OrganizationId, id: string, expected: OpsTask["status"], patch: Partial<Pick<OpsTask, "checklist" | "status" | "completedBy" | "completedAt">>): Promise<OpsTask | null>;

  listForms(org: OrganizationId): Promise<RequestForm[]>;
  createForm(org: OrganizationId, f: RequestFormInput, by: string): Promise<RequestForm>;
  archiveForm(org: OrganizationId, id: string): Promise<void>;
  listRequests(org: OrganizationId, f: { status?: CustomRequest["status"]; employeeId?: string }): Promise<CustomRequest[]>;
  getRequest(org: OrganizationId, id: string): Promise<CustomRequest | null>;
  createRequest(org: OrganizationId, r: Omit<CustomRequest, "id" | "status" | "decidedBy" | "decidedAt" | "decisionComment" | "createdAt">): Promise<CustomRequest>;
  decideRequest(org: OrganizationId, id: string, d: { status: "approved" | "rejected"; decidedBy: string; comment: string | null }): Promise<CustomRequest | null>;
}

export interface WorkspaceContextPort {
  employeeForUser(org: OrganizationId, userId: string): Promise<string | null>;
  employeeLocations(org: OrganizationId, employeeId: string): Promise<string[]>;
  /** Quem está a trabalhar agora (última marcação de hoje ≠ saída). */
  presentNow(org: OrganizationId): Promise<Presence[]>;
  whosInScope(org: OrganizationId, employeeId: string): Promise<"own_location" | "organization">;
  now(): string;
  notify(org: OrganizationId, userIds: string[], n: { title: string; body: string; link: string; dedupeKey: string }): Promise<void>;
  userOfEmployee(org: OrganizationId, employeeId: string): Promise<string | null>;
  audit(org: OrganizationId, e: { actor: string; action: string; resourceId: string; after: unknown; reason: string | null }): Promise<void>;
}
