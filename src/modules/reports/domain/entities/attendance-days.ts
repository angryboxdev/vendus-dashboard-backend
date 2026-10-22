/**
 * Relatório de assiduidade (Novo RH → Mais → Relatórios → Assiduidade): os
 * dias apurados pelo motor de ponto (`boardMany`, a mesma fonte das outras
 * vistas — RE-6), reduzidos ao que o relatório soma. O agrupamento por semana,
 * mês ou total faz-se no ecrã, que pede o período em blocos de até 31 dias.
 */

/** Máximo de dias por pedido (o motor apura no máximo 31 dias de cada vez). */
export const ATTENDANCE_DAYS_MAX = 31;

export interface AttendanceDayRow {
  employeeId: string;
  workDate: string;
  /** Segundos trabalhados e planeados (teórico do motor). */
  worked: number;
  planned: number;
  late: boolean;
  lateMinutes: number;
  /** Falta: devia ter entrado e não entrou, sem ausência nem feriado. */
  missing: boolean;
  /** Saída esquecida ou registo fechado automaticamente. */
  forgotten: boolean;
  /** Feriado confirmado ou ausência registada. */
  excused: boolean;
}

/** O que o motor devolve por dia (subconjunto de `DayBoard`). */
export interface BoardDay {
  workDate: string;
  workedSeconds: number;
  theoreticalSeconds: number;
  incidents: string[];
  excused: boolean;
  lateMinutes: number;
}

/** Linha do relatório; `null` para dias sem nada (nem planeado, nem trabalho, nem ausência). */
export function toDayRow(employeeId: string, d: BoardDay): AttendanceDayRow | null {
  const late = d.incidents.includes("late") || d.lateMinutes > 0;
  const missing = d.incidents.includes("missing_in") && !d.excused;
  const forgotten = d.incidents.includes("missing_out") || d.incidents.includes("auto_closed");
  if (!d.workedSeconds && !d.theoreticalSeconds && !d.excused && !late && !missing && !forgotten) return null;
  return { employeeId, workDate: d.workDate, worked: d.workedSeconds, planned: d.theoreticalSeconds, late, lateMinutes: d.lateMinutes, missing, forgotten, excused: d.excused };
}

export interface AttendanceDaysFilters {
  locationIds: string[];
  groupIds: string[];
  departmentIds: string[];
  employeeIds: string[];
}

/** Tabela pronta a exportar (Excel): cabeçalhos e linhas já calculados no ecrã. */
export interface ExportTable {
  title: string;
  subtitle: string;
  columns: string[];
  rows: (string | number)[][];
}

export const EXPORT_MAX_ROWS = 5000;
export const EXPORT_MAX_COLUMNS = 40;

/** Valida a tabela vinda do ecrã (tamanhos e tipos); devolve a mensagem do erro ou `null`. */
export function exportTableProblem(t: unknown): string | null {
  const v = t as Partial<ExportTable> | null;
  if (!v || typeof v.title !== "string" || !Array.isArray(v.columns) || !Array.isArray(v.rows)) return "Tabela inválida.";
  if (!v.columns.length || v.columns.length > EXPORT_MAX_COLUMNS || v.columns.some((c) => typeof c !== "string")) return "Colunas inválidas.";
  if (v.rows.length > EXPORT_MAX_ROWS) return `Máximo de ${EXPORT_MAX_ROWS} linhas por exportação.`;
  if (v.rows.some((r) => !Array.isArray(r) || r.length !== v.columns!.length || r.some((c) => typeof c !== "string" && typeof c !== "number"))) return "Linhas inválidas.";
  return null;
}

/** Texto que o Excel interpretaria como fórmula fica neutralizado (como no CSV). */
export const safeCell = (c: string | number) => (typeof c === "string" && /^[=+\-@\t\r]/.test(c) ? `'${c}` : c);
