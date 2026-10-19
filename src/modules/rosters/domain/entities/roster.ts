import { RosterValidationError } from "../errors.js";

/** Faixa horária local "HH:MM"; fim ≤ início = termina no dia seguinte. */
export interface Segment {
  start: string;
  end: string;
}

/** Modelo de turno (4.1): nome e abreviatura obrigatórios (RE-15), uma ou mais faixas. */
export interface ShiftTemplate {
  id: string;
  name: string;
  abbreviation: string;
  color: string | null;
  onCall: boolean;
  segments: Segment[];
  archived: boolean;
}

export type ShiftTemplateInput = Omit<ShiftTemplate, "id" | "archived">;

export interface Roster {
  id: string;
  name: string;
  targetType: "location" | "group";
  targetId: string;
  version: number;
  archived: boolean;
}

/** Estado de um turno que conta (publicado) ou que se está a editar (rascunho). */
export interface ShiftState {
  employeeId: string;
  workDate: string;
  kind: "shift" | "day_off";
  segments: Segment[];
  templateId: string | null;
  onCall: boolean;
}

export interface RosterShift extends ShiftState {
  id: string;
  rosterId: string;
  deleted: boolean;
  dirty: boolean;
  published: ShiftState | null;
  publishedVersion: number | null;
}

export interface Publication {
  id: string;
  rosterId: string;
  version: number;
  reason: string | null;
  confirmedWarnings: unknown[];
  changes: { shiftId: string; employeeId: string; before: ShiftState | null; after: ShiftState | null }[];
  publishedBy: string;
  createdAt: string;
}

export interface Swap {
  id: string;
  shiftId: string;
  counterShiftId: string | null;
  requesterEmployeeId: string;
  targetEmployeeId: string;
  status: "pending_target" | "pending_manager" | "approved" | "rejected" | "cancelled";
  comment: string | null;
  decidedBy: string | null;
  createdAt: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export function validateSegments(segments: Segment[], field = "segments"): void {
  if (!Array.isArray(segments) || segments.length < 1 || segments.length > 4) throw new RosterValidationError("Indique de 1 a 4 faixas horárias.", field);
  for (const s of segments) if (!TIME.test(s.start) || !TIME.test(s.end) || s.start === s.end) throw new RosterValidationError("Faixa horária inválida.", field);
  // As faixas de um turno repartido não se podem sobrepor (nem passar umas por cima das outras).
  const r = segmentRanges(segments);
  for (let i = 1; i < r.length; i++) if (r[i]!.start < r[i - 1]!.end) throw new RosterValidationError("As faixas do turno sobrepõem-se.", field);
}

/**
 * Faixas de um turno em minutos desde as 00:00 do dia do turno, por ordem:
 * uma faixa que acaba antes de começar passa a meia-noite; uma faixa que
 * começa antes da anterior já é do dia seguinte (ex.: 18:00–23:00 e
 * 00:30–02:00 → a segunda é madrugada do dia seguinte). Faixas encostadas
 * (fim = início) não se sobrepõem.
 */
export function segmentRanges(segments: Segment[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let offset = 0;
  for (const seg of segments) {
    let a = toMin(seg.start) + offset;
    const prev = out.at(-1);
    if (prev && a < prev.start) {
      a += 1440;
      offset += 1440;
    }
    let b = toMin(seg.end) + offset;
    if (b <= a) {
      b += 1440;
      offset += 1440;
    }
    out.push({ start: a, end: b });
  }
  return out;
}

/** RE-15: guardar sem nome ou abreviatura → "Campo obrigatório". */
export function validateTemplate(t: ShiftTemplateInput): void {
  if (!t.name?.trim()) throw new RosterValidationError("Campo obrigatório", "name");
  if (!t.abbreviation?.trim()) throw new RosterValidationError("Campo obrigatório", "abbreviation");
  if (t.name.trim().length > 80) throw new RosterValidationError("Máximo de 80 caracteres.", "name");
  if (t.abbreviation.trim().length > 6) throw new RosterValidationError("Máximo de 6 caracteres.", "abbreviation");
  if (t.color !== null && !COLOR.test(t.color)) throw new RosterValidationError("Cor inválida.", "color");
  validateSegments(t.segments);
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Minutos de um turno (faixas que passam a meia-noite contam até ao fim). */
export function shiftMinutes(s: Pick<ShiftState, "kind" | "segments">): number {
  if (s.kind === "day_off") return 0;
  return s.segments.reduce((acc, seg) => {
    const a = toMin(seg.start);
    const b = toMin(seg.end);
    return acc + (b > a ? b - a : 1440 - a + b);
  }, 0);
}

export const sameState = (a: ShiftState | null, b: ShiftState | null) => JSON.stringify(a) === JSON.stringify(b);
export const stateOf = (s: ShiftState): ShiftState => ({ employeeId: s.employeeId, workDate: s.workDate, kind: s.kind, segments: s.segments, templateId: s.templateId, onCall: s.onCall });
