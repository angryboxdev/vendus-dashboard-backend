/**
 * Dashboard executivo do Novo RH. Só DTOs de leitura (agregados de outras
 * fontes) e o layout pessoal — nada disto é fonte de verdade.
 */

/**
 * Categorias do "Estado da equipa" (mapeiam estados reais do apuramento):
 * a trabalhar, remoto, em pausa, já saiu, ainda por entrar, férias e
 * ausentes (ausência aprovada ou falta sem marcação). Só a folga fica de fora.
 */
export type TeamCategory = "working" | "remote" | "break" | "finished" | "not_started" | "vacation" | "absent";
export const TEAM_CATEGORIES: TeamCategory[] = ["working", "remote", "break", "finished", "not_started", "vacation", "absent"];

/** Estado do dia de uma pessoa, como o painel (Overview) o devolve. */
export interface DashboardPerson {
  employeeId: string;
  name: string;
  locationId: string | null;
  locationName: string | null;
  status: "working" | "remote" | "break" | "finished" | "absent" | "missing" | "not_started" | "day_off";
  lateMinutes: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  firstInAt: string | null;
  absenceType: string | null;
  absenceCategory: string | null;
}

/** Pedido pendente (Caixa de pedidos), só o necessário para contar e mostrar. */
export interface DashboardRequest {
  key: string;
  type: string;
  employeeId: string;
  employeeName: string;
  locationName: string | null;
  title: string;
  requestedAt: string;
  canDecide: boolean;
}

/** Pessoa que devia trabalhar (horário) e não tem turno publicado na escala do seu centro. */
export interface CoverageGap {
  employeeId: string;
  name: string;
  locationId: string | null;
  date: string;
}

export interface TeamCounts {
  total: number;
  working: number;
  remote: number;
  break: number;
  finished: number;
  not_started: number;
  vacation: number;
  absent: number;
  /** Sinais (não categorias do donut). */
  late: number;
  missing: number;
}

export type Severity = "critical" | "urgent" | "attention";

export interface AttentionItem {
  key: "missing" | "late" | "uncovered" | "requests" | "absences_review";
  severity: Severity;
  count: number;
  label: string;
}

export interface UnitRow {
  locationId: string;
  name: string;
  people: number;
  present: number;
  late: number;
  absent: number;
  missing: number;
  uncovered: number;
  pending: number;
  /** Derivado das métricas (nunca guardado). */
  state: "critical" | "attention" | "normal";
}

export interface OperationalSnapshot {
  generatedAt: string;
  context: { type: "organization" | "location"; locationId: string | null; name: string | null };
  localDate: string;
  tomorrow: string;
  units: { operational: number; requiringAttention: number };
  team: TeamCounts;
  coverage: { uncoveredToday: number; uncoveredTomorrow: number; uncoveredTotal: number };
  requests: { pending: number; decidable: number };
  attention: AttentionItem[];
  /** Resumo por centro (uma só agregação no servidor). */
  locations: UnitRow[];
  holidays: { date: string; name: string }[];
  /** Fontes que falharam ou demoraram (os widgets delas mostram aviso; o resto funciona). */
  partial: ("requests" | "coverage")[];
}

/** Layout pessoal: só metadados visuais. */
export interface WidgetPref {
  widgetId: string;
  order: number;
  span: number;
  hidden: boolean;
}

export interface DashboardLayout {
  layoutVersion: number;
  widgets: WidgetPref[];
}
