/**
 * Catálogo de relatórios (Fase 9 — ADR-0033; FE-063): assiduidade, saldos,
 * ausências, dados incompletos, contratos e histórico de alterações. Sempre no
 * âmbito de quem consulta; sem NIF/IBAN.
 */
export type ReportKey = "attendance" | "balances" | "absences" | "incomplete_data" | "contracts" | "change_history";

/** Grupos do catálogo (FE-063). */
export type ReportGroup = "time" | "leave" | "people" | "history";
export const REPORT_GROUPS: { key: ReportGroup; label: string }[] = [
  { key: "time", label: "Assiduidade e banco de horas" },
  { key: "leave", label: "Ausências e férias" },
  { key: "people", label: "Pessoas e contratos" },
  { key: "history", label: "Histórico de alterações" },
];

export interface ReportColumn {
  key: string;
  label: string;
  /** Explicação curta da coluna (mostrada no gerador). */
  hint?: string;
}

export interface ReportDefinition {
  key: ReportKey;
  group: ReportGroup;
  label: string;
  description: string;
  /** Precisa de período (de/até). */
  needsPeriod: boolean;
  /** Linhas ligadas a um colaborador (filtradas pelo âmbito, por centro e por pessoa). */
  perEmployee: boolean;
  columns: ReportColumn[];
}

export const REPORTS: ReportDefinition[] = [
  {
    key: "attendance",
    group: "time",
    label: "Assiduidade",
    description: "Horas trabalhadas, teóricas, diferença, noturnas e pendentes por colaborador no período (dias apurados).",
    needsPeriod: true,
    perEmployee: true,
    columns: [
      { key: "employee", label: "Colaborador" },
      { key: "worked", label: "Trabalhado (h)", hint: "Soma dos dias apurados no período — os mesmos valores do ecrã de Ponto." },
      { key: "theoretical", label: "Teórico (h)", hint: "Horas previstas pelo horário ou pela escala." },
      { key: "difference", label: "Diferença (h)", hint: "Trabalhado menos teórico." },
      { key: "night", label: "Noturno (h)" },
      { key: "pending", label: "Pendente (h)", hint: "Horas ainda por validar." },
      { key: "openIncidents", label: "Incidentes abertos" },
    ],
  },
  {
    key: "balances",
    group: "time",
    label: "Saldos",
    description: "Saldos de férias e ausências por tipo e saldo do banco de horas.",
    needsPeriod: false,
    perEmployee: true,
    columns: [
      { key: "employee", label: "Colaborador" },
      { key: "type", label: "Tipo" },
      { key: "unit", label: "Unidade" },
      { key: "accrued", label: "Acumulado" },
      { key: "used", label: "Gozado" },
      { key: "pending", label: "Pendente", hint: "Pedido mas ainda não aprovado." },
      { key: "available", label: "Disponível" },
    ],
  },
  {
    key: "absences",
    group: "leave",
    label: "Ausências",
    description: "Ausências aprovadas no período (as privadas aparecem como 'Ausência').",
    needsPeriod: true,
    perEmployee: true,
    columns: [
      { key: "employee", label: "Colaborador" },
      { key: "type", label: "Tipo" },
      { key: "start", label: "Início" },
      { key: "end", label: "Fim" },
      { key: "amount", label: "Quantidade" },
      { key: "unit", label: "Unidade" },
    ],
  },
  {
    key: "incomplete_data",
    group: "people",
    label: "Dados incompletos",
    description: "Colaboradores ativos sem NIF, contrato ativo, horário ou escala, responsável ou conta do Portal.",
    needsPeriod: false,
    perEmployee: true,
    columns: [
      { key: "employee", label: "Colaborador" },
      { key: "missing", label: "Em falta" },
    ],
  },
  {
    key: "contracts",
    group: "people",
    label: "Contratos",
    description: "Contratos dos colaboradores ativos: tipo, início, fim, horas semanais e fim do período experimental.",
    needsPeriod: false,
    perEmployee: true,
    columns: [
      { key: "employee", label: "Colaborador" },
      { key: "type", label: "Tipo" },
      { key: "start", label: "Início" },
      { key: "end", label: "Fim", hint: "Vazio quando é sem termo." },
      { key: "weeklyHours", label: "Horas semanais" },
      { key: "probationEnd", label: "Fim do período experimental" },
      { key: "state", label: "Estado", hint: "Em vigor, terminado, futuro ou anulado, à data de hoje." },
    ],
  },
  {
    key: "change_history",
    group: "history",
    label: "Histórico de alterações",
    description: "Alterações registadas na auditoria (quem, quando, o quê e porquê), sem os valores.",
    needsPeriod: true,
    perEmployee: false,
    columns: [
      { key: "when", label: "Quando" },
      { key: "actor", label: "Quem" },
      { key: "action", label: "Ação" },
      { key: "resource", label: "Recurso" },
      { key: "reason", label: "Motivo" },
    ],
  },
];

export type ReportRow = Record<string, string | number> & { employeeId?: string };

/** Filtros do gerador (por identificadores). Vazio = sem filtro. */
export interface ReportFilters {
  locationIds: string[];
  employeeIds: string[];
  /** Subconjunto das colunas da definição, pela ordem pedida. Vazio = todas. */
  columns: string[];
}

/** Colunas pedidas, validadas contra a definição. Devolve `null` se alguma não existir. */
export function pickColumns(def: ReportDefinition, keys: string[]): ReportColumn[] | null {
  if (!keys.length) return def.columns;
  const out: ReportColumn[] = [];
  for (const k of keys) {
    const c = def.columns.find((x) => x.key === k);
    if (!c) return null;
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

const BOM = "﻿";
function cell(v: string | number): string {
  const s = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : v;
  // Números (ex.: "-8" ou "-8,5") não são fórmulas; o resto que comece por = + - @ é neutralizado.
  const safe = /^-?\d+(,\d+)?$/.test(s) || !/^[=+\-@\t\r]/.test(s) ? s : `'${s}`;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV `;`, UTF-8 com BOM, decimais com vírgula, fórmulas neutralizadas. */
export function toCsv(columns: ReportColumn[], rows: ReportRow[]): string {
  const lines = [columns.map((c) => cell(c.label)).join(";"), ...rows.map((r) => columns.map((c) => cell(r[c.key] ?? "")).join(";"))];
  return BOM + lines.join("\r\n") + "\r\n";
}
