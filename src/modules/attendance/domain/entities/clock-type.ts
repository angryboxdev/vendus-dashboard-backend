import { DateTime } from "luxon";
import { AttendanceValidationError } from "../errors.js";
import type { ClockTypeRule } from "../services/day-engine.js";

/**
 * Tipo adicional de registo (FE-105): formação, deslocação, teletrabalho…
 * Separa o tempo em obra do resto (salários e faturação). A remuneração é
 * sempre escolhida; o que passar do máximo por dia não conta; dias e horas
 * bloqueados impedem começar.
 */
export interface ClockType {
  id: string;
  name: string;
  color: string | null;
  /** Conta como teletrabalho (a marcação fica como "remoto"). */
  remote: boolean;
  remuneration: "paid" | "unpaid" | "hybrid";
  hybridPaidMinutes: number | null;
  maxMinutesPerDay: number | null;
  blockedWeekdays: number[] | null;
  blockedHours: { start: string; end: string }[];
  archived: boolean;
  version: number;
}

export type ClockTypeInput = Omit<ClockType, "id" | "archived" | "version">;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function validateClockType(i: ClockTypeInput): void {
  if (!i.name?.trim() || i.name.trim().length > 60) throw new AttendanceValidationError("O nome é obrigatório (máx. 60).", "name");
  if (i.color !== null && !COLOR.test(i.color)) throw new AttendanceValidationError("Cor inválida.", "color");
  if (!["paid", "unpaid", "hybrid"].includes(i.remuneration)) throw new AttendanceValidationError("Escolha se o tempo conta como trabalhado (pago, não pago ou híbrido).", "remuneration");
  if (i.remuneration === "hybrid" ? !int(i.hybridPaidMinutes, 1, 1440) : i.hybridPaidMinutes !== null) throw new AttendanceValidationError("No tipo híbrido, indique os minutos pagos por dia (1 a 1440).", "hybridPaidMinutes");
  if (i.maxMinutesPerDay !== null && !int(i.maxMinutesPerDay, 1, 1440)) throw new AttendanceValidationError("Máximo por dia entre 1 e 1440 minutos.", "maxMinutesPerDay");
  if (i.blockedWeekdays !== null && (!Array.isArray(i.blockedWeekdays) || i.blockedWeekdays.length < 1 || i.blockedWeekdays.length > 6 || i.blockedWeekdays.some((d) => !int(d, 1, 7))))
    throw new AttendanceValidationError("Dias bloqueados inválidos (não pode bloquear os 7 dias).", "blockedWeekdays");
  if (!Array.isArray(i.blockedHours) || i.blockedHours.length > 6) throw new AttendanceValidationError("No máximo 6 faixas bloqueadas.", "blockedHours");
  for (const h of i.blockedHours) if (!TIME.test(h.start) || !TIME.test(h.end) || h.start === h.end) throw new AttendanceValidationError("Faixa bloqueada inválida (HH:MM; início diferente do fim).", "blockedHours");
}

export const clockTypeRule = (c: ClockType): ClockTypeRule => ({ remuneration: c.remuneration, hybridPaidMinutes: c.hybridPaidMinutes, maxMinutesPerDay: c.maxMinutesPerDay });

const inside = (hm: string, r: { start: string; end: string }) => (r.start < r.end ? hm >= r.start && hm < r.end : hm >= r.start || hm < r.end);

/** Porque não se pode começar este tipo agora (null = pode). `usedSecondsToday` = tempo já registado neste tipo hoje. */
export function clockTypeRefusal(c: ClockType, nowUtc: string, timeZone: string, usedSecondsToday: number): string | null {
  if (c.archived) return "Este tipo de registo já não está disponível.";
  const local = DateTime.fromISO(nowUtc, { zone: "utc" }).setZone(timeZone);
  if (c.blockedWeekdays?.includes(local.weekday)) return `"${c.name}" não está disponível neste dia.`;
  const hm = local.toFormat("HH:mm");
  const blocked = c.blockedHours.find((r) => inside(hm, r));
  if (blocked) return `"${c.name}" está bloqueado entre ${blocked.start} e ${blocked.end}.`;
  if (c.maxMinutesPerDay !== null && usedSecondsToday >= c.maxMinutesPerDay * 60) return `Já atingiu o máximo de ${c.maxMinutesPerDay} min de "${c.name}" hoje.`;
  return null;
}
