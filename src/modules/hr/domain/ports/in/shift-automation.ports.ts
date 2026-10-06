import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Weekday } from "../../entities/base-schedule-template.js";
import type { ShiftAutomationStatus } from "../../entities/shift-automation.js";
import type { ApplicationAudience, OccurrenceStatus } from "../../services/template-application.service.js";

export interface ShiftAutomationDTO {
  id: string;
  name: string;
  description: string | null;
  kind: "weekly";
  templateId: string;
  templateName: string;
  audience: ApplicationAudience;
  locationId: string | null;
  weekdays: Weekday[];
  startDate: string;
  endDate: string | null;
  horizonWeeks: number;
  status: ShiftAutomationStatus;
  generatedUntil: string | null;
  lastRunAt: string | null;
  /** Ocorrências por resolver (conflitos/ausências) ainda não dispensadas. */
  openIssues: number;
  updatedAt: string;
}

export interface ShiftAutomationInput {
  name: string;
  description: string | null;
  templateId: string;
  audience: ApplicationAudience;
  locationId: string | null;
  weekdays: Weekday[];
  startDate: string;
  endDate: string | null;
  horizonWeeks: number;
}

export interface ListShiftAutomationsPort {
  execute(organizationId: OrganizationId): Promise<ShiftAutomationDTO[]>;
}

export interface CreateShiftAutomationCommand extends ShiftAutomationInput {
  organizationId: OrganizationId;
  actor: string;
  /** Gera já as primeiras semanas ("Guardar como automatização" no Aplicar modelo). */
  generateNow: boolean;
}

export interface CreateShiftAutomationResultDTO {
  automation: ShiftAutomationDTO;
  generation: AutomationGenerationResultDTO | null;
}

export interface CreateShiftAutomationPort {
  execute(command: CreateShiftAutomationCommand): Promise<CreateShiftAutomationResultDTO>;
}

export interface UpdateShiftAutomationCommand extends Partial<ShiftAutomationInput> {
  organizationId: OrganizationId;
  actor: string;
  id: string;
}

/** Afeta só gerações futuras — turnos já gerados ficam como estão (task RH 2.0 §1). */
export interface UpdateShiftAutomationPort {
  execute(command: UpdateShiftAutomationCommand): Promise<ShiftAutomationDTO>;
}

export interface SetShiftAutomationStatusCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  status: ShiftAutomationStatus;
}

export interface SetShiftAutomationStatusPort {
  execute(command: SetShiftAutomationStatusCommand): Promise<ShiftAutomationDTO>;
}

// ── Geração ──────────────────────────────────────────────────────────────

export interface AutomationGenerationResultDTO {
  automationId: string;
  /** Janela gerada; null = nada por gerar (já gerado até ao horizonte, terminada ou pausada). */
  window: { from: string; to: string } | null;
  created: number;
  /** Turnos que já existiam (gerar de novo nunca duplica). */
  alreadyExisting: number;
  /** Ocorrências não criadas, enviadas para "Alertas e ações" (conflitos nunca são forçados). */
  issues: number;
}

export interface GenerateAutomationCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  /** "Gerar próximas X semanas"; omisso = horizonte da automatização. */
  weeks?: number;
}

export interface GenerateAutomationPort {
  execute(command: GenerateAutomationCommand): Promise<AutomationGenerationResultDTO>;
}

/** Cron diário: todas as automatizações ativas de uma organização; uma falha não trava as outras. */
export interface GenerateAllAutomationsPort {
  execute(command: { organizationId: OrganizationId; actor: string }): Promise<{
    results: AutomationGenerationResultDTO[];
    failed: { automationId: string; error: string }[];
  }>;
}

// ── Ocorrências por resolver ("Alertas e ações") ─────────────────────────

export interface AutomationIssueDTO {
  id: string;
  automationId: string;
  automationName: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  status: OccurrenceStatus | "inactive_template";
}

export interface DismissAutomationIssuePort {
  execute(command: { organizationId: OrganizationId; actor: string; id: string }): Promise<void>;
}
