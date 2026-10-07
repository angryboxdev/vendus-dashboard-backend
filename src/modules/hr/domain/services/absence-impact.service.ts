/**
 * Regras puras de Férias & Ausências 2.0: dias úteis (segunda a sexta sem
 * feriados — mesma regra do legacy quando o colaborador não tem escala
 * base) e duração legível.
 */

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function workingDaysBetween(from: string, to: string, holidays: Set<string>): number {
  return eachDay(from, to).filter((d) => {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    return wd !== 0 && wd !== 6 && !holidays.has(d);
  }).length;
}

/** "5 dias úteis", "1 dia útil", "4 horas", "Meio dia", "2h30". */
export function durationLabel(a: { workingDays: number; minutes: number | null; startTime: string | null }): string {
  if (a.minutes != null) {
    if (!a.startTime && a.minutes === 240) return "Meio dia";
    const h = Math.floor(a.minutes / 60);
    const m = a.minutes % 60;
    if (m === 0) return `${h} ${h === 1 ? "hora" : "horas"}`;
    return `${h}h${String(m).padStart(2, "0")}`;
  }
  return `${a.workingDays} ${a.workingDays === 1 ? "dia útil" : "dias úteis"}`;
}
