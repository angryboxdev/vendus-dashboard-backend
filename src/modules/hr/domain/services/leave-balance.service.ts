/**
 * Saldos de férias (Férias & Ausências 2.0, separador "Saldos"). Regra de
 * sugestão igual à do legacy (`suggestDaysEntitled` em hrLeaveService): sem
 * admissão ou admitido antes do ano → 22; no ano de admissão → 2 por mês
 * completo até ao fim do ano, máx. 20. É só uma sugestão — o RH confirma.
 */
export function suggestDaysEntitled(hiredAt: string | null, year: number): number {
  if (!hiredAt) return 22;
  const hireYear = Number(hiredAt.slice(0, 4));
  if (hireYear < year) return 22;
  if (hireYear > year) return 0;
  const hire = new Date(`${hiredAt}T12:00:00Z`).getTime();
  const yearEnd = new Date(`${year}-12-31T12:00:00Z`).getTime();
  const months = Math.floor((yearEnd - hire) / (1000 * 60 * 60 * 24 * 30.44));
  return Math.min(Math.max(months, 0) * 2, 20);
}

/** Férias do ano: só ausências ativas de tipo férias que começam no ano (mesma regra do saldo legacy). */
export function vacationDaysInYear(
  absences: Array<{ type: string; status: string; startDate: string; endDate: string; workingDays: number }>,
  year: number,
  today: string,
): { taken: number; scheduled: number } {
  let taken = 0;
  let scheduled = 0;
  for (const a of absences) {
    if (a.type !== "vacation" || a.status !== "active" || !a.startDate.startsWith(String(year))) continue;
    if (a.endDate < today) taken += a.workingDays;
    else scheduled += a.workingDays;
  }
  return { taken, scheduled };
}

export const MAX_BALANCE_DAYS = 60;
