import type { ApplicationAudience } from "../../domain/services/template-application.service.js";

/** Leitores de corpo HTTP partilhados pelos controllers de Modelos e Automatizações (RH 2.0). */

export const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export const stringArray = (v: unknown): string[] | null => (Array.isArray(v) && v.every(isString) ? v : null);

export function readAudience(v: unknown): ApplicationAudience | null {
  const a = (v ?? {}) as Record<string, unknown>;
  switch (a.kind) {
    case "employees": {
      const ids = stringArray(a.employeeIds);
      return ids ? { kind: "employees", employeeIds: ids } : null;
    }
    case "all":
      return { kind: "all" };
    case "position":
      return isString(a.positionId) ? { kind: "position", positionId: a.positionId, locationId: isString(a.locationId) ? a.locationId : null } : null;
    case "location":
      return isString(a.locationId) ? { kind: "location", locationId: a.locationId } : null;
    default:
      return null;
  }
}

/** Dias da semana 0 (segunda) … 6 (domingo). */
export function readWeekdays(v: unknown): (0 | 1 | 2 | 3 | 4 | 5 | 6)[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((w): w is 0 | 1 | 2 | 3 | 4 | 5 | 6 => Number.isInteger(w) && (w as number) >= 0 && (w as number) <= 6);
}
