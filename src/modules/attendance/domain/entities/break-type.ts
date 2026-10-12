import { DateTime } from "luxon";
import { AttendanceValidationError } from "../errors.js";
import type { BreakRule } from "../services/day-engine.js";

/**
 * Tipo de pausa do catálogo (FE-103). A remuneração é sempre escolhida (sem
 * valor por omissão): paga, não paga ou híbrida (os primeiros N minutos do dia
 * pagos). O que passar da duração máxima não é pago. Janela, usos por dia e
 * dias da semana são verificados ao iniciar a pausa.
 */
export interface BreakType {
  id: string;
  name: string;
  color: string | null;
  remuneration: "paid" | "unpaid" | "hybrid";
  hybridPaidMinutes: number | null;
  maxMinutes: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  maxUsesPerDay: number | null;
  weekdays: number[] | null;
  archived: boolean;
  version: number;
}

export type BreakTypeInput = Omit<BreakType, "id" | "archived" | "version">;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function validateBreakType(i: BreakTypeInput): void {
  if (!i.name?.trim() || i.name.trim().length > 60) throw new AttendanceValidationError("O nome é obrigatório (máx. 60).", "name");
  if (i.color !== null && !COLOR.test(i.color)) throw new AttendanceValidationError("Cor inválida.", "color");
  if (!["paid", "unpaid", "hybrid"].includes(i.remuneration)) throw new AttendanceValidationError("Escolha se a pausa é paga, não paga ou híbrida.", "remuneration");
  if (i.remuneration === "hybrid" ? !int(i.hybridPaidMinutes, 1, 1440) : i.hybridPaidMinutes !== null) throw new AttendanceValidationError("Na pausa híbrida, indique os minutos pagos por dia (1 a 1440).", "hybridPaidMinutes");
  if (i.maxMinutes !== null && !int(i.maxMinutes, 1, 1440)) throw new AttendanceValidationError("Duração máxima entre 1 e 1440 minutos.", "maxMinutes");
  if ((i.windowStart === null) !== (i.windowEnd === null)) throw new AttendanceValidationError("Indique o início e o fim da janela.", "windowStart");
  if (i.windowStart !== null && (!TIME.test(i.windowStart) || !TIME.test(i.windowEnd!) || i.windowStart === i.windowEnd)) throw new AttendanceValidationError("Janela inválida (HH:MM; início diferente do fim).", "windowStart");
  if (i.maxUsesPerDay !== null && !int(i.maxUsesPerDay, 1, 50)) throw new AttendanceValidationError("Utilizações por dia entre 1 e 50.", "maxUsesPerDay");
  if (i.weekdays !== null && (!Array.isArray(i.weekdays) || i.weekdays.length < 1 || i.weekdays.some((d) => !int(d, 1, 7)))) throw new AttendanceValidationError("Escolha pelo menos um dia da semana.", "weekdays");
}

export const breakRule = (b: BreakType): BreakRule => ({ remuneration: b.remuneration, hybridPaidMinutes: b.hybridPaidMinutes, maxMinutes: b.maxMinutes });

/** Porque não se pode iniciar esta pausa agora (null = pode). `usesToday` = pausas deste tipo já iniciadas hoje. */
export function breakRefusal(b: BreakType, nowUtc: string, timeZone: string, usesToday: number): string | null {
  if (b.archived) return "Esta pausa já não está disponível.";
  const local = DateTime.fromISO(nowUtc, { zone: "utc" }).setZone(timeZone);
  if (b.weekdays && !b.weekdays.includes(local.weekday)) return `A pausa "${b.name}" não está disponível neste dia.`;
  if (b.windowStart && b.windowEnd) {
    const hm = local.toFormat("HH:mm");
    const inside = b.windowStart < b.windowEnd ? hm >= b.windowStart && hm < b.windowEnd : hm >= b.windowStart || hm < b.windowEnd;
    if (!inside) return `A pausa "${b.name}" só pode começar entre ${b.windowStart} e ${b.windowEnd}.`;
  }
  if (b.maxUsesPerDay !== null && usesToday >= b.maxUsesPerDay) return `Já usou a pausa "${b.name}" ${usesToday} vez(es) hoje (máximo ${b.maxUsesPerDay}).`;
  return null;
}
