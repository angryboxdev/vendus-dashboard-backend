import type { Segment } from "../entities/roster.js";

/**
 * Colegas do turno (Portal ligado ao Novo RH): quem tem turno publicado na
 * mesma escala com horário sobreposto, incluindo noturnos de dias vizinhos.
 * Regras puras — o caso de uso decide a visibilidade e o que se mostra.
 */

const DAY = 1440;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const dayIndex = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/** Faixas em minutos absolutos (dia × 1440 + minuto); fim ≤ início termina no dia seguinte. */
export function absoluteRanges(workDate: string, segments: Segment[]): [number, number][] {
  const base = dayIndex(workDate) * DAY;
  return segments.map((s) => {
    const a = minutes(s.start);
    const b = minutes(s.end);
    return [base + a, base + (b > a ? b : b + DAY)];
  });
}

/** Dois turnos sobrepõem-se se alguma faixa de um cruza alguma do outro (encostar não conta). */
export function shiftsOverlap(a: { workDate: string; segments: Segment[] }, b: { workDate: string; segments: Segment[] }): boolean {
  const ra = absoluteRanges(a.workDate, a.segments);
  const rb = absoluteRanges(b.workDate, b.segments);
  return ra.some(([a1, a2]) => rb.some(([b1, b2]) => a1 < b2 && b1 < a2));
}

/** «Ana Delgado Castro» → «Ana Castro» (só para mostrar; o nome guardado não muda). */
export function coworkerShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  if (parts.length <= 1) return cap(parts[0] ?? "");
  return `${cap(parts[0]!)} ${cap(parts[parts.length - 1]!)}`;
}

/** «09:00–13:00 · 14:00–18:00». */
export const hoursLabel = (segments: Segment[]) => segments.map((s) => `${s.start}–${s.end}`).join(" · ");
