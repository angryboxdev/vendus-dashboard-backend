/**
 * Catálogo de relatórios prioritários (Fase 9 — ADR-0033): assiduidade,
 * saldos, ausências, dados incompletos e histórico de alterações. Sempre no
 * âmbito de quem consulta; sem NIF/IBAN.
 */
export type ReportKey = "attendance" | "balances" | "absences" | "incomplete_data" | "change_history";

export interface ReportDefinition {
  key: ReportKey;
  label: string;
  description: string;
  /** Precisa de período (de/até). */
  needsPeriod: boolean;
  /** Linhas ligadas a um colaborador (filtradas pelo âmbito). */
  perEmployee: boolean;
  columns: { key: string; label: string }[];
}

export const REPORTS: ReportDefinition[] = [
  {
    key: "attendance",
    label: "Assiduidade",
    description: "Horas trabalhadas, teóricas, diferença, noturnas e pendentes por colaborador no período (dias apurados).",
    needsPeriod: true,
    perEmployee: true,
    columns: [
      { key: "employee", label: "Colaborador" },
      { key: "worked", label: "Trabalhado (h)" },
      { key: "theoretical", label: "Teórico (h)" },
      { key: "difference", label: "Diferença (h)" },
      { key: "night", label: "Noturno (h)" },
      { key: "pending", label: "Pendente (h)" },
      { key: "openIncidents", label: "Incidentes abertos" },
    ],
  },
  {
    key: "balances",
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
      { key: "pending", label: "Pendente" },
      { key: "available", label: "Disponível" },
    ],
  },
  {
    key: "absences",
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
    key: "change_history",
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

const BOM = "﻿";
function cell(v: string | number): string {
  const s = typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : v;
  // Números (ex.: "-8" ou "-8,5") não são fórmulas; o resto que comece por = + - @ é neutralizado.
  const safe = /^-?\d+(,\d+)?$/.test(s) || !/^[=+\-@\t\r]/.test(s) ? s : `'${s}`;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV `;`, UTF-8 com BOM, decimais com vírgula, fórmulas neutralizadas. */
export function toCsv(def: ReportDefinition, rows: ReportRow[]): string {
  const lines = [def.columns.map((c) => cell(c.label)).join(";"), ...rows.map((r) => def.columns.map((c) => cell(r[c.key] ?? "")).join(";"))];
  return BOM + lines.join("\r\n") + "\r\n";
}
