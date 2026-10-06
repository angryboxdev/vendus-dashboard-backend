import type { ShiftTemplateGroup } from "../../entities/shift-template.js";
import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ShiftKind } from "../../entities/work-shift.js";
import type {
  ApplicationAudience,
  ApplicationDays,
  OccurrenceDecision,
  OccurrenceStatus,
} from "../../services/template-application.service.js";

export interface ShiftTemplateDTO {
  id: string;
  name: string;
  /** Organização da biblioteca (Abertura/Intermédio/Fecho/Full time/Outro). */
  group: ShiftTemplateGroup;
  description: string | null;
  color: string | null;
  kind: ShiftKind;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  secondStartTime: string | null;
  secondEndTime: string | null;
  breakMinutes: number;
  /** Tempo de trabalho (períodos − pausa), em minutos. */
  workMinutes: number;
  /** Do início do 1.º período ao fim do último, em minutos. */
  spanMinutes: number;
  locationId: string | null;
  active: boolean;
  updatedAt: string;
}

export interface ShiftTemplateInput {
  name: string;
  /** Omitido na criação = "OTHER". */
  group?: ShiftTemplateGroup;
  description: string | null;
  color: string | null;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  secondStartTime: string | null;
  secondEndTime: string | null;
  breakMinutes: number;
  locationId: string | null;
}

/** Ativos primeiro, depois por nome. */
export interface ListShiftTemplatesPort {
  execute(organizationId: OrganizationId): Promise<ShiftTemplateDTO[]>;
}

export interface CreateShiftTemplateCommand extends ShiftTemplateInput {
  organizationId: OrganizationId;
  actor: string;
}

export interface CreateShiftTemplatePort {
  execute(command: CreateShiftTemplateCommand): Promise<ShiftTemplateDTO>;
}

export interface UpdateShiftTemplateCommand extends Partial<ShiftTemplateInput> {
  organizationId: OrganizationId;
  actor: string;
  id: string;
}

/** Afeta só utilizações futuras — nunca toca turnos já criados (RH 2.0 §1). */
export interface UpdateShiftTemplatePort {
  execute(command: UpdateShiftTemplateCommand): Promise<ShiftTemplateDTO>;
}

export interface SetShiftTemplateActiveCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  active: boolean;
}

/** Ativar/inativar — nunca há hard delete. */
export interface SetShiftTemplateActivePort {
  execute(command: SetShiftTemplateActiveCommand): Promise<ShiftTemplateDTO>;
}

// ── Aplicar modelo (ticket 02) ───────────────────────────────────────────

export interface TemplateApplicationConfig {
  templateId: string;
  audience: ApplicationAudience;
  days: ApplicationDays;
  /** Local escolhido na aplicação (1.º na precedência); null = modelo → local principal do colaborador. */
  locationId: string | null;
}

export interface TemplateOccurrenceDTO {
  key: string;
  employeeId: string;
  employeeName: string;
  positionId: string | null;
  workDate: string;
  startTime: string;
  endTime: string;
  secondStartTime: string | null;
  secondEndTime: string | null;
  endsNextDay: boolean;
  locationId: string | null;
  status: OccurrenceStatus;
  holidayName: string | null;
  /** Turno já existente em causa (duplicado/sobreposição), para o "Detalhes do conflito". */
  existingShift: { id: string; startTime: string; endTime: string; secondStartTime: string | null; secondEndTime: string | null; locationId: string } | null;
  existingHasAttendance: boolean;
}

export interface TemplateApplicationPreviewDTO {
  occurrences: TemplateOccurrenceDTO[];
  summary: {
    employees: number;
    valid: number;
    duplicate: number;
    overlap: number;
    /** Férias/ausências. */
    unavailable: number;
    /** Colaborador/local inativo ou sem local. */
    inactive: number;
    /** Ocorrências em feriado (criam-se na mesma, assinaladas — R4). */
    holidays: number;
  };
}

export interface PreviewTemplateApplicationCommand extends TemplateApplicationConfig {
  organizationId: OrganizationId;
}

export interface PreviewTemplateApplicationPort {
  execute(command: PreviewTemplateApplicationCommand): Promise<TemplateApplicationPreviewDTO>;
}

export interface ApplyTemplateCommand extends TemplateApplicationConfig {
  organizationId: OrganizationId;
  actor: string;
  /** Decisões sobre a pré-visualização, por `key`. Sem decisão = não estava na pré-visualização → não é criada. */
  decisions: Record<string, OccurrenceDecision>;
}

export interface ApplyTemplateResultDTO {
  created: number;
  replaced: number;
  skipped: number;
  /** Ocorrências que mudaram desde a pré-visualização e não foram aplicadas (revalidação, §5). */
  changed: { key: string; employeeName: string; workDate: string; status: OccurrenceStatus }[];
}

/** Turnos criados em rascunho (R1), `source: "template"`; repetir nunca duplica (§6). */
export interface ApplyTemplatePort {
  execute(command: ApplyTemplateCommand): Promise<ApplyTemplateResultDTO>;
}
