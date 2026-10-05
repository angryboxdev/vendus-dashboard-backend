import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ShiftAutomation } from "../../entities/shift-automation.js";
import type { OccurrenceStatus } from "../../services/template-application.service.js";

export interface ShiftAutomationRepositoryPort {
  findAll(organizationId: OrganizationId): Promise<ShiftAutomation[]>;
  findById(organizationId: OrganizationId, id: string): Promise<ShiftAutomation | null>;
  insert(organizationId: OrganizationId, automation: ShiftAutomation): Promise<void>;
  update(organizationId: OrganizationId, automation: ShiftAutomation): Promise<void>;
}

export type AutomationIssueStatus = Exclude<OccurrenceStatus, "valid" | "duplicate"> | "inactive_template";

export interface AutomationIssue {
  id: string;
  automationId: string;
  employeeId: string;
  workDate: string;
  status: AutomationIssueStatus;
  dismissedAt: string | null;
}

/** `hr_shift_automation_issues` — uma por automatização × colaborador × dia. */
export interface AutomationIssueRepositoryPort {
  /** Insere ou atualiza (mesma chave) — reabre uma ocorrência dispensada se voltar a acontecer. */
  upsertMany(organizationId: OrganizationId, issues: Omit<AutomationIssue, "id" | "dismissedAt">[]): Promise<void>;
  /** Por dispensar, com `workDate` em [from, to]. */
  findOpenInRange(organizationId: OrganizationId, from: string, to: string): Promise<AutomationIssue[]>;
  /** Contagem por automatização das ocorrências por dispensar. */
  countOpenByAutomation(organizationId: OrganizationId): Promise<Map<string, number>>;
  findById(organizationId: OrganizationId, id: string): Promise<AutomationIssue | null>;
  dismiss(organizationId: OrganizationId, id: string, actor: string, at: Date): Promise<void>;
}
