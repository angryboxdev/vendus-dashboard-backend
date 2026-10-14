import type { ChangePlan, EmployeeView, ShiftView } from "../entities/assistant.js";

/** Regras puras do Assistente Mezza (sem IA, sem base de dados). */

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export type NameMatch<T> = { kind: "one"; item: T } | { kind: "ambiguous"; items: T[] } | { kind: "none" };

/**
 * Colaborador por nome, sem adivinhar: nome completo igual ganha; senão
 * todas as palavras do pedido têm de existir no nome. Mais de um → ambíguo.
 */
export function matchByName<T extends { name: string }>(query: string, items: T[]): NameMatch<T> {
  const q = norm(query);
  if (!q) return { kind: "none" };
  const exact = items.filter((i) => norm(i.name) === q);
  if (exact.length === 1) return { kind: "one", item: exact[0]! };
  const words = q.split(" ");
  const hits = (exact.length ? exact : items).filter((i) => {
    const parts = norm(i.name).split(" ");
    return words.every((w) => parts.some((p) => p === w || p.startsWith(w)));
  });
  if (hits.length === 1) return { kind: "one", item: hits[0]! };
  if (hits.length > 1) return { kind: "ambiguous", items: hits };
  return { kind: "none" };
}

/** Limiares para pedir confirmação (alterações grandes ou destrutivas). */
export const CONFIRM_REMOVALS = 5;
export const CONFIRM_TOTAL = 15;
export const CONFIRM_PEOPLE_WITH_REMOVALS = 4;

/**
 * Pede confirmação quando a alteração é grande, apaga muitos turnos ou mexe
 * em várias pessoas; pedidos explícitos e pequenos executam logo.
 */
export function needsConfirmation(plan: ChangePlan): boolean {
  const removes = plan.removes.length;
  const total = removes + plan.creates.length;
  if (plan.command === "CLEAR_PENDING" && removes > 0) return true;
  if (removes >= CONFIRM_REMOVALS || total >= CONFIRM_TOTAL) return true;
  const people = new Set(plan.removes.map((r) => r.employeeId));
  return removes > 0 && people.size >= CONFIRM_PEOPLE_WITH_REMOVALS;
}

/** Impressão dos turnos que um plano retira (para saber se a escala mudou antes de confirmar). */
export function fingerprint(shifts: Pick<ShiftView, "id" | "employeeId" | "workDate" | "segments" | "pendingOnly">[]): string {
  return shifts
    .map((s) => `${s.id}|${s.employeeId}|${s.workDate}|${s.segments.map((g) => `${g.start}-${g.end}`).join(",")}|${s.pendingOnly ? 1 : 0}`)
    .sort()
    .join(";");
}

const WEEKDAY = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export function weekdayName(date: string): string {
  return WEEKDAY[isoWeekday(date) - 1]!;
}

/** "terça-feira 15/10" */
export function dayLabel(date: string): string {
  return `${weekdayName(date)} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export function hoursLabel(segments: { start: string; end: string }[]): string {
  return segments.length ? segments.map((s) => `${s.start}–${s.end}`).join(" + ") : "folga";
}

/** Datas de `from` a `to` (inclusive), opcionalmente só nos dias da semana ISO indicados (1 = segunda). */
export function expandDates(from: string, to: string, weekdays: number[] = [], max = 62): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (!weekdays.length || weekdays.includes(isoWeekday(d))) out.push(d);
    if (out.length > max) break;
  }
  return out;
}

const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** Minutos de um turno (passa da meia-noite quando o fim é antes do início). */
export function shiftMinutes(segments: { start: string; end: string }[]): number {
  return segments.reduce((n, s) => {
    const a = minutes(s.start);
    const b = minutes(s.end);
    return n + (b > a ? b - a : b + 1440 - a);
  }, 0);
}

export const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mesmo horário (para detetar modelos equivalentes e não os duplicar). */
export function sameSegments(a: { start: string; end: string }[], b: { start: string; end: string }[]): boolean {
  return a.length === b.length && a.every((s, i) => s.start === b[i]!.start && s.end === b[i]!.end);
}

/** Frases do que o servidor fez — determinísticas, não dependem da IA. */
export function planFacts(plan: ChangePlan, names: Map<string, string>): string[] {
  const who = (id: string) => names.get(id) ?? "colaborador";
  const out: string[] = [];
  if (plan.creates.length === 1) {
    const c = plan.creates[0]!;
    out.push(`${who(c.employeeId)} — ${dayLabel(c.workDate)}, ${hoursLabel(c.segments)}`);
  } else if (plan.creates.length > 1) out.push(`${plan.creates.length} turnos criados (${new Set(plan.creates.map((c) => c.employeeId)).size} colaborador(es))`);
  if (plan.removes.length === 1) {
    const r = plan.removes[0]!;
    out.push(`Retirado: ${who(r.employeeId)} — ${dayLabel(r.workDate)}, ${hoursLabel(r.segments)}`);
  } else if (plan.removes.length > 1) out.push(`${plan.removes.length} turnos retirados (${new Set(plan.removes.map((r) => r.employeeId)).size} colaborador(es))`);
  for (const s of plan.skipped.slice(0, 5)) out.push(`Não feito: ${s.what} — ${s.reason}`);
  if (plan.skipped.length > 5) out.push(`… e mais ${plan.skipped.length - 5} por fazer.`);
  return out;
}

/** Resumo para confirmar (antes de executar). */
export function confirmationSummary(plan: ChangePlan, names: Map<string, string>): string {
  const people = new Set([...plan.creates, ...plan.removes].map((x) => x.employeeId)).size;
  const parts = [];
  if (plan.removes.length) parts.push(`removerá ${plan.removes.length} turno(s) não publicado(s)`);
  if (plan.creates.length) parts.push(`criará ${plan.creates.length} turno(s)`);
  const list = [...plan.removes.map((r) => `− ${names.get(r.employeeId) ?? "?"} ${dayLabel(r.workDate)} ${hoursLabel(r.segments)}`), ...plan.creates.map((c) => `+ ${names.get(c.employeeId) ?? "?"} ${dayLabel(c.workDate)} ${hoursLabel(c.segments)}`)];
  const shown = list.slice(0, 8).join("\n");
  return `Esta ação ${parts.join(" e ")} de ${people} colaborador(es). Confirmar?\n${shown}${list.length > 8 ? `\n… e mais ${list.length - 8}` : ""}`;
}

/** Só o necessário para Escalas chega à IA (RGPD): nome e cargo. */
export function employeeForModel(e: EmployeeView, ref: string): { ref: string; name: string; position: string | null; inThisRoster: boolean } {
  return { ref, name: e.name, position: e.positionName, inThisRoster: e.member };
}
