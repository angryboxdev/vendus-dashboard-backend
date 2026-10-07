/**
 * Horas de um turno que pode atravessar a meia-noite. As marcações são
 * guardadas só como "HH:mm" (sem data) — o dia certo de cada uma deduz-se
 * pela hora planeada mais próxima (dia anterior, o próprio, ou o seguinte).
 * Assim uma entrada às 00:10 num turno das 23:50 é um atraso de 20 min, e
 * uma saída às 00:40 de um turno que acaba às 23:30 é +70 min — nunca ±24h.
 */

const DAY = 24 * 60;

export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Minutos de `hm` (sem data) colocados no dia mais próximo de `referenceMinutes` (minutos desde o início do dia do turno). */
export function anchorNear(hm: string, referenceMinutes: number): number {
  const base = hmToMinutes(hm);
  let best = base;
  for (const candidate of [base - DAY, base + DAY]) {
    if (Math.abs(candidate - referenceMinutes) < Math.abs(best - referenceMinutes)) best = candidate;
  }
  return best;
}

/** Início/fim planeados em minutos desde o início do dia do turno (`endsNextDay` → fim no dia seguinte). */
export function plannedRange(start: string, end: string, endsNextDay: boolean): { start: number; end: number } {
  const s = hmToMinutes(start);
  let e = hmToMinutes(end);
  if (endsNextDay || e <= s) e += DAY;
  return { start: s, end: e };
}

/** Registado − planeado, em minutos, com a marcação no dia mais próximo da hora planeada. */
export function clockDiffMinutes(actualHm: string, plannedMinutes: number): number {
  return anchorNear(actualHm, plannedMinutes) - plannedMinutes;
}

/**
 * Duração real de um período. Com horário planeado, cada marcação vai para
 * o dia mais próximo da respetiva hora planeada; sem plano (presença sem
 * escala), fim ≤ início = passou a meia-noite.
 */
export function actualPeriodMinutes(actualStart: string, actualEnd: string, planned: { start: number; end: number } | null): number {
  if (!planned) {
    const d = hmToMinutes(actualEnd) - hmToMinutes(actualStart);
    return d > 0 ? d : d + DAY;
  }
  const s = anchorNear(actualStart, planned.start);
  let e = anchorNear(actualEnd, planned.end);
  if (e <= s) e += DAY;
  return e - s;
}
