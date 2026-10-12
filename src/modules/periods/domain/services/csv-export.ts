import type { EmployeeTotals } from "../entities/period.js";

/**
 * Formatos v1 (D10, ADR-0031): CSV com `;`, UTF-8 com BOM, decimais com
 * vírgula, horas em decimal com 2 casas. Os totais vêm da fotografia do fecho.
 */
const BOM = "﻿";
const hours = (seconds: number) => (seconds / 3600).toFixed(2).replace(".", ",");
const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
/** Evita injeção de fórmulas em folhas de cálculo e escapa `;`/aspas. */
function cell(v: string): string {
  // Números (ex.: "-8,00") não são fórmulas; o resto que comece por = + - @ é neutralizado.
  const safe = /^-?\d+(,\d+)?$/.test(v) || !/^[=+\-@\t\r]/.test(v) ? v : `'${v}`;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
const line = (cells: string[]) => cells.map(cell).join(";");

export interface EmployeeInfo {
  employeeId: string;
  name: string;
  nif: string | null;
}

export function payrollCsv(period: { startDate: string; endDate: string }, totals: EmployeeTotals[], people: EmployeeInfo[], includeSensitive: boolean): string {
  const types = [...new Map(totals.flatMap((t) => t.absences).map((a) => [a.typeId, a])).values()].sort((a, b) => a.typeName.localeCompare(b.typeName, "pt"));
  const header = [
    "periodo_inicio",
    "periodo_fim",
    "colaborador_id",
    "nome",
    ...(includeSensitive ? ["nif"] : []),
    "horas_trabalhadas",
    "horas_teoricas",
    "diferenca_horas",
    "horas_noturnas",
    "horas_pendentes",
    ...types.map((t) => `ausencia_${t.code ?? t.typeName}_${t.unit === "days" ? "dias" : "horas"}`),
    "banco_horas_periodo",
    "banco_horas_pagas",
  ];
  const rows = totals.map((t) => {
    const p = people.find((x) => x.employeeId === t.employeeId);
    return line([
      period.startDate,
      period.endDate,
      t.employeeId,
      p?.name ?? "",
      ...(includeSensitive ? [p?.nif ?? ""] : []),
      hours(t.workedSeconds),
      hours(t.theoreticalSeconds),
      hours(t.excessSeconds),
      hours(t.nightSeconds),
      hours(t.pendingSeconds),
      ...types.map((ty) => num(t.absences.filter((a) => a.typeId === ty.typeId).reduce((s, a) => s + a.amount, 0))),
      hours(t.bankSeconds),
      hours(t.bankPaidSeconds),
    ]);
  });
  return BOM + [line(header), ...rows].join("\r\n") + "\r\n";
}

/** Faturação v1 por centro (o modelo cliente/obra é a proposta ADR-0032). */
export function billingByLocationCsv(period: { startDate: string; endDate: string }, totals: EmployeeTotals[], people: EmployeeInfo[], locationName: (id: string | null) => string): string {
  const header = ["periodo_inicio", "periodo_fim", "centro", "colaborador_id", "nome", "horas_trabalhadas"];
  const rows: string[] = [];
  for (const t of totals) {
    for (const l of t.byLocation) {
      if (l.workedSeconds === 0) continue;
      rows.push(line([period.startDate, period.endDate, locationName(l.locationId), t.employeeId, people.find((p) => p.employeeId === t.employeeId)?.name ?? "", hours(l.workedSeconds)]));
    }
  }
  return BOM + [line(header), ...rows].join("\r\n") + "\r\n";
}
