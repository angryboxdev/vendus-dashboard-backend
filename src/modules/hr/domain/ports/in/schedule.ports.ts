import type { AutomationIssueDTO } from "./shift-automation.ports.js";
import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { ShiftStatus, ShiftSource } from "../../entities/work-shift.js";
import type { Weekday } from "../../entities/base-schedule-template.js";

// ── Turnos (work shifts) ────────────────────────────────────────────────────

export interface WorkShiftDTO {
  id: string;
  employeeId: string;
  employeeName: string;
  workDate: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  secondStartTime: string | null;
  secondEndTime: string | null;
  locationId: string;
  breakMinutes: number;
  notes: string | null;
  status: ShiftStatus;
  source: ShiftSource;
  rotationId: string | null;
  seriesId: string | null;
  /** Modelo de turno de origem (RH 2.0); null = não veio de um modelo. */
  templateId: string | null;
  /** Automatização de origem (RH 2.0); null = não veio de uma automatização. */
  automationId: string | null;
  /** Estado de presença já registado (lido de hr_shift_attendance), quando existe — para a bolinha "Pendente"/"Conferido" do calendário. */
  attendanceStatus: "worked_as_planned" | "late" | "left_early" | "cancelled" | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListWorkShiftsCommand {
  organizationId: OrganizationId;
  from: string;
  to: string;
  employeeId?: string;
  locationId?: string;
  status?: ShiftStatus;
}

export interface ListWorkShiftsPort {
  execute(command: ListWorkShiftsCommand): Promise<WorkShiftDTO[]>;
}

export interface CreateWorkShiftCommand {
  organizationId: OrganizationId;
  actor: string;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  /** Turno noturno — `endTime` refere-se ao dia seguinte. Nunca combinado com 2º período. */
  endsNextDay?: boolean;
  /** Turno repartido — 2º período (ex: 12:00–16:00 / 19:00–23:00). */
  secondStartTime?: string | null;
  secondEndTime?: string | null;
  locationId: string;
  breakMinutes?: number;
  notes?: string | null;
  /** Repetir semanalmente — cria também para as próximas N semanas (drawer: "Repetir semanalmente"). */
  repeatWeeks?: number;
  /** Publicar após guardar — se false, fica em rascunho. */
  publish?: boolean;
}

export interface CreateWorkShiftPort {
  execute(command: CreateWorkShiftCommand): Promise<WorkShiftDTO[]>;
}

export interface UpdateWorkShiftCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  workDate?: string;
  startTime?: string;
  endTime?: string;
  endsNextDay?: boolean;
  secondStartTime?: string | null;
  secondEndTime?: string | null;
  locationId?: string;
  breakMinutes?: number;
  notes?: string | null;
}

export interface UpdateWorkShiftPort {
  execute(command: UpdateWorkShiftCommand): Promise<WorkShiftDTO>;
}

export interface DuplicateWorkShiftCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
  targetDate: string;
}

export interface DuplicateWorkShiftPort {
  execute(command: DuplicateWorkShiftCommand): Promise<WorkShiftDTO>;
}

export interface DeleteWorkShiftCommand {
  organizationId: OrganizationId;
  actor: string;
  id: string;
}

export interface DeleteWorkShiftPort {
  execute(command: DeleteWorkShiftCommand): Promise<void>;
}

export interface PublishWorkShiftsCommand {
  organizationId: OrganizationId;
  actor: string;
  ids: string[];
}

export interface PublishWorkShiftsPort {
  execute(command: PublishWorkShiftsCommand): Promise<WorkShiftDTO[]>;
}

// ── Escala base ──────────────────────────────────────────────────────────────

export interface BaseScheduleCellDTO {
  id: string;
  employeeId: string;
  weekday: Weekday;
  isDayOff: boolean;
  startTime: string | null;
  endTime: string | null;
  locationId: string | null;
  breakMinutes: number;
}

export interface GetBaseScheduleCommand {
  organizationId: OrganizationId;
  employeeId: string;
}

export interface GetBaseSchedulePort {
  execute(command: GetBaseScheduleCommand): Promise<BaseScheduleCellDTO[]>;
}

export interface UpsertBaseScheduleCellCommand {
  organizationId: OrganizationId;
  actor: string;
  employeeId: string;
  weekday: Weekday;
  isDayOff: boolean;
  startTime?: string | null;
  endTime?: string | null;
  locationId?: string | null;
  breakMinutes?: number;
}

export interface UpsertBaseScheduleCellPort {
  execute(command: UpsertBaseScheduleCellCommand): Promise<BaseScheduleCellDTO>;
}

export interface ApplyBaseScheduleCommand {
  organizationId: OrganizationId;
  actor: string;
  employeeId: string;
  /** Segunda-feira da semana alvo. */
  weekStartDate: string;
  /** Reescreve mesmo turnos "manual" existentes nesses dias (o utilizador confirmou a sobreposição). Por omissão, esses dias são saltados. */
  overrideExceptions?: boolean;
}

export interface ApplyBaseScheduleResultDTO {
  created: WorkShiftDTO[];
  updated: WorkShiftDTO[];
  skippedDates: string[];
}

export interface ApplyBaseSchedulePort {
  execute(command: ApplyBaseScheduleCommand): Promise<ApplyBaseScheduleResultDTO>;
}

// ── Turnos rotativos ─────────────────────────────────────────────────────────

export interface ShiftRotationPatternDTO {
  startTime: string;
  endTime: string;
  /** 2º período (turno repartido) — null = turno direto (1 período). */
  secondStartTime: string | null;
  secondEndTime: string | null;
}

export interface ShiftRotationDTO {
  id: string;
  participantEmployeeIds: [string, string];
  participantNames: [string, string];
  patternA: ShiftRotationPatternDTO;
  patternB: ShiftRotationPatternDTO;
  locationId: string;
  anchorDate: string;
  autoSwitchWeekly: boolean;
  active: boolean;
}

export interface ListShiftRotationsCommand {
  organizationId: OrganizationId;
}

export interface ListShiftRotationsPort {
  execute(command: ListShiftRotationsCommand): Promise<ShiftRotationDTO[]>;
}

export interface CreateShiftRotationCommand {
  organizationId: OrganizationId;
  actor: string;
  participantEmployeeIds: [string, string];
  patternA: { startTime: string; endTime: string; secondStartTime?: string | null; secondEndTime?: string | null };
  patternB: { startTime: string; endTime: string; secondStartTime?: string | null; secondEndTime?: string | null };
  locationId: string;
  anchorDate: string;
  autoSwitchWeekly?: boolean;
}

export interface CreateShiftRotationPort {
  execute(command: CreateShiftRotationCommand): Promise<ShiftRotationDTO>;
}

export interface RotationWeekPreviewDTO {
  weekStartDate: string;
  patternAEmployeeId: string;
  patternAEmployeeName: string;
  patternBEmployeeId: string;
  patternBEmployeeName: string;
  /** Horário real de cada padrão nesta semana — task "melhorar a pré-visualização" (o mesmo em todas as semanas, a rotação só muda quem o faz). */
  patternA: ShiftRotationPatternDTO;
  patternB: ShiftRotationPatternDTO;
}

export interface PreviewShiftRotationCommand {
  organizationId: OrganizationId;
  rotationId: string;
  weeks?: number;
}

export interface PreviewShiftRotationPort {
  execute(command: PreviewShiftRotationCommand): Promise<RotationWeekPreviewDTO[]>;
}

export interface ApplyShiftRotationCommand {
  organizationId: OrganizationId;
  actor: string;
  rotationId: string;
  /** A partir de que segunda-feira materializar (por omissão, a semana corrente). */
  fromWeekStartDate?: string;
  weeks?: number;
}

export interface ApplyShiftRotationResultDTO {
  created: WorkShiftDTO[];
  updated: WorkShiftDTO[];
  skippedDates: string[];
}

export interface ApplyShiftRotationPort {
  execute(command: ApplyShiftRotationCommand): Promise<ApplyShiftRotationResultDTO>;
}

export interface SetShiftRotationActiveCommand {
  organizationId: OrganizationId;
  actor: string;
  rotationId: string;
  active: boolean;
}

export interface SetShiftRotationActivePort {
  execute(command: SetShiftRotationActiveCommand): Promise<ShiftRotationDTO>;
}

// ── Alertas ──────────────────────────────────────────────────────────────────

export interface ScheduleAlertsDTO {
  coverageGaps: Array<{ employeeId: string; employeeName: string; workDate: string; locationId: string | null }>;
  overlaps: Array<{ employeeId: string; employeeName: string; workDate: string; shiftIds: string[] }>;
  /** RH 2.0: ocorrências que as automatizações não criaram (conflito, ausência, sem local…), por dispensar. */
  automationIssues: AutomationIssueDTO[];
  pendingPublishCount: number;
  pendingPublishRange: { from: string; to: string } | null;
}

export interface GetScheduleAlertsCommand {
  organizationId: OrganizationId;
  from: string;
  to: string;
  locationId?: string;
}

export interface GetScheduleAlertsPort {
  execute(command: GetScheduleAlertsCommand): Promise<ScheduleAlertsDTO>;
}

// ── "Novo turno" — padrão semanal / séries recorrentes ──────────────────────

export interface ShiftSegmentDTO {
  startTime: string;
  endTime: string;
}

export interface WeeklyDayRuleDTO {
  weekdays: Weekday[];
  /** 1 período = turno direto; 2 = turno repartido. */
  segments: ShiftSegmentDTO[];
  endsNextDay?: boolean;
}

export type RepeatModeDTO = { kind: "none" } | { kind: "weeks"; weeks: number } | { kind: "until_date"; untilDate: string };

export type OccurrenceStatus = "available" | "conflict" | "skipped_leave" | "skipped_holiday";

export interface PlannedOccurrenceDTO {
  workDate: string;
  weekday: Weekday;
  segments: ShiftSegmentDTO[];
  endsNextDay: boolean;
  status: OccurrenceStatus;
}

export interface PreviewWorkShiftSeriesCommand {
  organizationId: OrganizationId;
  employeeId: string;
  locationId: string;
  startDate: string;
  rules: WeeklyDayRuleDTO[];
  repeat: RepeatModeDTO;
}

export interface PreviewWorkShiftSeriesResultDTO {
  occurrences: PlannedOccurrenceDTO[];
  availableCount: number;
  conflictCount: number;
  skippedCount: number;
}

export interface PreviewWorkShiftSeriesPort {
  execute(command: PreviewWorkShiftSeriesCommand): Promise<PreviewWorkShiftSeriesResultDTO>;
}

export interface CreateWorkShiftSeriesCommand extends PreviewWorkShiftSeriesCommand {
  actor: string;
  /** Rascunho (false) ou publicado (true) — "Guardar rascunho" vs. "Criar N turnos". */
  publish: boolean;
  /** Cria também as ocorrências em conflito (sobreposição com turno existente) — nunca ultrapassa férias/ausência/feriado, isso nunca se força. */
  force?: boolean;
  notes?: string | null;
}

export interface CreateWorkShiftSeriesResultDTO {
  /** null quando só 1 turno foi criado (não há série a formar). */
  seriesId: string | null;
  created: WorkShiftDTO[];
  /** Não criados por sobrepor um turno existente (só quando `force` não foi pedido). */
  conflicts: PlannedOccurrenceDTO[];
  /** Nunca criados — férias/ausência ou feriado nesse dia. */
  skipped: PlannedOccurrenceDTO[];
}

export interface CreateWorkShiftSeriesPort {
  execute(command: CreateWorkShiftSeriesCommand): Promise<CreateWorkShiftSeriesResultDTO>;
}

export type SeriesEditScope = "only_this" | "this_and_following" | "whole_series";

export interface UpdateWorkShiftSeriesScopeCommand {
  organizationId: OrganizationId;
  actor: string;
  /** Turno em que o utilizador clicou para editar. */
  id: string;
  scope: SeriesEditScope;
  startTime?: string;
  endTime?: string;
  endsNextDay?: boolean;
  secondStartTime?: string | null;
  secondEndTime?: string | null;
  locationId?: string;
  notes?: string | null;
}

export interface UpdateWorkShiftSeriesScopePort {
  execute(command: UpdateWorkShiftSeriesScopeCommand): Promise<WorkShiftDTO[]>;
}

export type ClearShiftsScope =
  | { kind: "day"; employeeId: string; workDate: string }
  | { kind: "days"; employeeId: string; workDates: string[] }
  | { kind: "week"; employeeId: string; weekStartDate: string }
  | { kind: "weeks"; employeeId: string; weekStartDates: string[] }
  | { kind: "series"; seriesId: string }
  /** Limpa a semana toda para TODOS os colaboradores (task "Repetir escala pelo calendário", "Limpar semana") — nunca implícito, só quando pedido explicitamente sem filtro de colaborador. */
  | { kind: "week_all"; weekStartDate: string; locationId?: string };

export interface ClearWorkShiftsCommand {
  organizationId: OrganizationId;
  actor: string;
  scope: ClearShiftsScope;
}

export interface ClearWorkShiftsResultDTO {
  deletedCount: number;
  skipped: Array<{ id: string; workDate: string; reason: "has_attendance" }>;
}

export interface ClearWorkShiftsPort {
  execute(command: ClearWorkShiftsCommand): Promise<ClearWorkShiftsResultDTO>;
}

// ── "Repetir escala pelo calendário" ─────────────────────────────────────────
// Copia os turnos REAIS de uma semana já montada (múltiplos colaboradores,
// cada um com o seu próprio padrão) para N semanas seguintes — ao contrário
// de "Novo Turno Padrão Semanal", a origem não é um formulário, é o que já
// está no calendário. Reaproveita o mesmo motor de partição
// (`computeSeriesPartition`) por (colaborador, local), nunca duplicando as
// regras de conflito/férias/feriado.

export interface RepeatWeekLocationGroupDTO {
  locationId: string;
  availableCount: number;
  conflictCount: number;
  skippedCount: number;
  occurrences: PlannedOccurrenceDTO[];
}

export interface RepeatWeekEmployeeDTO {
  employeeId: string;
  employeeName: string;
  availableCount: number;
  conflictCount: number;
  skippedCount: number;
  locations: RepeatWeekLocationGroupDTO[];
}

export interface PreviewRepeatCalendarWeekCommand {
  organizationId: OrganizationId;
  /** Segunda-feira da semana de origem (a semana já montada no calendário). */
  sourceWeekStartDate: string;
  /** Dias da semana a copiar — os 7 = "semana inteira". */
  weekdays: Weekday[];
  /** Colaboradores a incluir — omitido/vazio = todos os encontrados na origem. Também define a ordem de rotação quando `rotateEmployees`. */
  employeeIds?: string[];
  /** Alterna o horário de cada colaborador com o do seguinte em `employeeIds` (2 = troca simples) em vez de cada um repetir o seu próprio — "Copiar semana"/alternar turnos. */
  rotateEmployees?: boolean;
  repeat: RepeatModeDTO;
}

export interface PreviewRepeatCalendarWeekResultDTO {
  targetStartDate: string;
  targetEndDate: string;
  employees: RepeatWeekEmployeeDTO[];
  totalAvailable: number;
  totalConflicts: number;
  totalSkipped: number;
}

export interface PreviewRepeatCalendarWeekPort {
  execute(command: PreviewRepeatCalendarWeekCommand): Promise<PreviewRepeatCalendarWeekResultDTO>;
}

export interface RepeatCalendarWeekCommand extends PreviewRepeatCalendarWeekCommand {
  actor: string;
  /** Rascunho (false) ou publicado (true) — decisão única para todo o lote (mesmo padrão de `CreateWorkShiftSeriesCommand.publish`). */
  publish: boolean;
  /** Cria também as ocorrências em conflito — nunca as de férias/ausência/feriado, essas nunca se forçam. */
  force?: boolean;
  notes?: string | null;
}

export interface RepeatCalendarWeekEmployeeResultDTO {
  employeeId: string;
  employeeName: string;
  created: WorkShiftDTO[];
  conflicts: PlannedOccurrenceDTO[];
  skipped: PlannedOccurrenceDTO[];
}

export interface RepeatCalendarWeekResultDTO {
  employees: RepeatCalendarWeekEmployeeResultDTO[];
  totalCreated: number;
  totalConflicts: number;
  totalSkipped: number;
}

export interface RepeatCalendarWeekPort {
  execute(command: RepeatCalendarWeekCommand): Promise<RepeatCalendarWeekResultDTO>;
}
