import type { WorkShift } from "../entities/work-shift.js";
import { InvalidClearShiftsScopeError } from "../errors.js";

/**
 * Regras da limpeza de turnos em massa por período (âmbito "range" —
 * pedido do utilizador, 2026-10-06). Puro: validação do período e filtros
 * opcionais, partilhados pela pré-visualização e pela confirmação.
 */

/** Teto de segurança: um ano (com bissexto). Mais do que isso é quase de certeza engano. */
export const MAX_CLEAR_RANGE_DAYS = 366;

export interface ClearRangeFilters {
  from: string;
  to: string;
  employeeIds?: string[];
  onlyDrafts?: boolean;
  automationId?: string;
  templateId?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function assertValidClearRange(range: { from: unknown; to: unknown; employeeIds?: unknown }): void {
  const { from, to, employeeIds } = range;
  if (typeof from !== "string" || typeof to !== "string" || !ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    throw new InvalidClearShiftsScopeError("Indique as datas de início e de fim do período (AAAA-MM-DD)");
  }
  if (from > to) {
    throw new InvalidClearShiftsScopeError("A data de início tem de ser igual ou anterior à data de fim");
  }
  if (dayNumber(to) - dayNumber(from) + 1 > MAX_CLEAR_RANGE_DAYS) {
    throw new InvalidClearShiftsScopeError(`O período não pode ter mais de ${MAX_CLEAR_RANGE_DAYS} dias`);
  }
  if (employeeIds !== undefined && (!Array.isArray(employeeIds) || employeeIds.length === 0)) {
    throw new InvalidClearShiftsScopeError("Escolha pelo menos um colaborador (ou omita a lista para todos)");
  }
}

/** Filtros opcionais do âmbito "range" (o período e o local já vêm filtrados da consulta). */
export function matchesClearRangeFilters(shift: WorkShift, filters: ClearRangeFilters): boolean {
  if (filters.employeeIds && !filters.employeeIds.includes(shift.employeeId)) return false;
  if (filters.onlyDrafts && shift.status !== "draft") return false;
  if (filters.automationId && shift.automationId !== filters.automationId) return false;
  if (filters.templateId && shift.templateId !== filters.templateId) return false;
  return true;
}
