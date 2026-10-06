/**
 * Regras da picagem Entrada/Saída pelo Portal do Colaborador (ticket 04,
 * decisão P7). Puro — o use case dá-lhe "agora" (hora do servidor, Europe/
 * Lisbon), os turnos publicados de hoje e de ontem e a assiduidade já
 * registada. Escreve na mesma Assiduidade do quiosque (uma linha por
 * turno: entrada + saída); a lógica de atraso/saída antecipada é a mesma do
 * quiosque. Corrige o que o quiosque não trata: só turnos publicados, saída
 * de turno noturno depois da meia-noite, saída no mesmo minuto da entrada,
 * pedido incoerente com o estado (Entrada → Entrada, Saída sem Entrada).
 *
 * Turno repartido: um só par entrada/saída por turno (limitação conhecida
 * da Assiduidade) — entra no início do 1º período e sai no fim do 2º.
 */

export type PunchKind = "in" | "out";

export interface PunchShift {
  id: string;
  workDate: string;
  startTime: string;
  /** Fim efetivo do turno (fim do 2º período num repartido). */
  endTime: string;
  endsNextDay: boolean;
  locationId: string;
}

export interface PunchAttendance {
  id: string;
  workShiftId: string;
  status: string;
  actualStartTime: string | null;
  actualEndTime: string | null;
}

export interface PunchNow {
  date: string;
  /** HH:mm (minuto do servidor). */
  time: string;
}

export type PunchRefusal =
  | { code: "NO_SHIFT" }
  | { code: "TOO_EARLY"; shiftStart: string; opensAt: string }
  | { code: "SHIFT_ENDED" }
  | { code: "DAY_COMPLETE" }
  | { code: "ALREADY_IN"; since: string }
  | { code: "NOT_IN" }
  | { code: "TOO_SOON" };

export type PunchPlan =
  | { ok: true; kind: "in"; shift: PunchShift; status: "worked_as_planned" | "late"; lateMinutes: number | null; time: string }
  | { ok: true; kind: "out"; shift: PunchShift; attendance: PunchAttendance; status: string; time: string }
  | { ok: false; refusal: PunchRefusal };

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const fromMin = (m: number) => {
  const d = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, "0")}:${String(d % 60).padStart(2, "0")}`;
};

/** Início e fim do turno em minutos relativos à meia-noite de "hoje" (o turno de ontem fica negativo). */
function window(shift: PunchShift, today: string): { start: number; end: number } {
  const offset = shift.workDate === today ? 0 : -1440;
  const start = toMin(shift.startTime) + offset;
  let end = toMin(shift.endTime) + offset;
  if (shift.endsNextDay || end <= start) end += 1440;
  return { start, end };
}

/** Estado atual: há uma entrada sem saída? (para o Início do Portal e para validar o pedido). */
export function openAttendance(shifts: PunchShift[], attendance: PunchAttendance[]): { shift: PunchShift; attendance: PunchAttendance } | null {
  for (const shift of shifts) {
    const a = attendance.find((x) => x.workShiftId === shift.id);
    if (a?.actualStartTime && !a.actualEndTime) return { shift, attendance: a };
  }
  return null;
}

/**
 * @param shifts turnos **publicados** do colaborador de hoje e os noturnos de ontem.
 * @param preShiftWindowMinutes quanto tempo antes do início se pode registar a entrada (regras de assiduidade).
 */
export function planPunch(
  requested: PunchKind,
  now: PunchNow,
  shifts: PunchShift[],
  attendance: PunchAttendance[],
  preShiftWindowMinutes: number,
): PunchPlan {
  const relevant = shifts
    .filter((s) => s.workDate === now.date || (s.endsNextDay && s.workDate < now.date))
    .sort((a, b) => window(a, now.date).start - window(b, now.date).start);
  const nowMin = toMin(now.time);
  const open = openAttendance(relevant, attendance);

  if (open) {
    if (requested === "in") return { ok: false, refusal: { code: "ALREADY_IN", since: open.attendance.actualStartTime!.slice(0, 5) } };
    if (open.attendance.actualStartTime!.slice(0, 5) === now.time) return { ok: false, refusal: { code: "TOO_SOON" } };
    const { end } = window(open.shift, now.date);
    const leftEarly = nowMin < end;
    const status = leftEarly && open.attendance.status === "worked_as_planned" ? "left_early" : open.attendance.status;
    return { ok: true, kind: "out", shift: open.shift, attendance: open.attendance, status, time: now.time };
  }

  if (requested === "out") return { ok: false, refusal: { code: "NOT_IN" } };
  const todays = relevant.filter((s) => s.workDate === now.date);
  if (todays.length === 0) return { ok: false, refusal: { code: "NO_SHIFT" } };

  const pending = todays.filter((s) => !attendance.some((a) => a.workShiftId === s.id));
  if (pending.length === 0) return { ok: false, refusal: { code: "DAY_COMPLETE" } };

  const current = pending.find((s) => window(s, now.date).end > nowMin);
  if (!current) return { ok: false, refusal: { code: "SHIFT_ENDED" } };
  const { start } = window(current, now.date);
  if (nowMin < start - preShiftWindowMinutes) {
    return { ok: false, refusal: { code: "TOO_EARLY", shiftStart: current.startTime.slice(0, 5), opensAt: fromMin(start - preShiftWindowMinutes) } };
  }
  const late = Math.max(0, nowMin - start);
  return { ok: true, kind: "in", shift: current, status: late > 0 ? "late" : "worked_as_planned", lateMinutes: late > 0 ? late : null, time: now.time };
}

export const PUNCH_REFUSAL_MESSAGES: Record<PunchRefusal["code"], string> = {
  NO_SHIFT: "Não tem turno publicado para hoje.",
  TOO_EARLY: "Ainda é cedo para registar a entrada.",
  SHIFT_ENDED: "O turno de hoje já terminou.",
  DAY_COMPLETE: "Entrada e saída de hoje já estão registadas.",
  ALREADY_IN: "A entrada já está registada.",
  NOT_IN: "Ainda não registou a entrada.",
  TOO_SOON: "Aguarde um minuto antes de registar a saída.",
};
