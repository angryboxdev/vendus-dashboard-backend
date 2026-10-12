/**
 * Painel do Novo RH (visão do dono/gestão): o que se passa hoje — quem está a
 * trabalhar, quem faltou, quem chegou atrasado, ausências e pendentes — com
 * o detalhe de cada pessoa a um clique. Só leitura: tudo vem dos outros
 * módulos (assiduidade, ausências, pessoas, tempo).
 */

/** Um dia de uma pessoa, tal como a assiduidade o apura (planeado vs. real). */
export interface OverviewDay {
  workDate: string;
  workedSeconds: number;
  theoreticalSeconds: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  excused: boolean;
  firstInAt: string | null;
  lateMinutes: number;
  startPassed: boolean;
  openType: "work" | "remote" | "break_paid" | "break_unpaid" | null;
  /** Faixas do dia (UTC). */
  segments: { start: string; end: string; type: "work" | "remote" | "break_paid" | "break_unpaid" }[];
}

export interface OverviewAbsence {
  employeeId: string;
  typeName: string;
  startDate: string;
  endDate: string;
}

/**
 * Estado de uma pessoa num dia:
 * - `working` / `remote` / `break` — registo aberto agora;
 * - `finished` — trabalhou e já saiu;
 * - `absent` — ausência aprovada;
 * - `missing` — tinha horário e não há marcação (falta por justificar);
 * - `not_started` — tinha horário, mas a hora de início ainda não passou;
 * - `day_off` — sem horário nesse dia (folga, feriado).
 */
export type PersonStatus = "working" | "remote" | "break" | "finished" | "absent" | "missing" | "not_started" | "day_off";

export interface PersonDayView {
  date: string;
  status: PersonStatus;
  lateMinutes: number;
  workedSeconds: number;
  theoreticalSeconds: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  firstInAt: string | null;
  absenceType: string | null;
}

export interface PersonOverview extends PersonDayView {
  employeeId: string;
  name: string;
  locationId: string | null;
  locationName: string | null;
  /** Últimos 7 dias, do mais antigo até ao dia escolhido. */
  week: PersonDayView[];
  /** Faixas do dia escolhido (linha do tempo 0–24 h). */
  segments: OverviewDay["segments"];
}

/** Horários planeados da equipa (FE-031): um dia de uma pessoa. */
export interface PlanCell {
  date: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  theoreticalSeconds: number;
  /** Ausência aprovada (nome do tipo). */
  absenceType: string | null;
  /** Dia justificado sem ausência: feriado. */
  holiday: boolean;
}

export interface TeamPlan {
  from: string;
  to: string;
  people: { employeeId: string; name: string; locationId: string | null; locationName: string | null; days: PlanCell[]; unplanned: boolean }[];
}

export interface OverviewKpis {
  people: number;
  scheduled: number;
  working: number;
  remote: number;
  onBreak: number;
  finished: number;
  absent: number;
  missing: number;
  late: number;
  notStarted: number;
}

export interface PendingCounts {
  absenceRequests: number;
  corrections: number;
  incidents: number;
  customRequests: number;
  alerts: number;
}

export interface LocationSummary {
  locationId: string | null;
  name: string;
  people: number;
  present: number;
  absent: number;
  missing: number;
  late: number;
}

export interface WeekPoint {
  date: string;
  late: number;
  missing: number;
  absent: number;
  workedSeconds: number;
  theoreticalSeconds: number;
}

export interface Overview {
  date: string;
  today: string;
  /** Fuso da organização (horas de entrada e planeadas). */
  timeZone: string;
  generatedAt: string;
  kpis: OverviewKpis;
  people: PersonOverview[];
  locations: LocationSummary[];
  week: WeekPoint[];
  pending: PendingCounts;
  holidays: { date: string; name: string }[];
}
