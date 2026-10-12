import { DateTime } from "luxon";

/**
 * Avisos automáticos do Novo RH (FE-111). Puro: dado o dia de cada pessoa,
 * os contratos e as regras efetivas, diz que avisos são devidos agora. Cada
 * aviso tem uma chave estável — o centro de notificações não repete a mesma.
 */
export interface ReminderRules {
  missingIn: { enabled: boolean; minutes: number };
  openAfterEnd: { enabled: boolean; minutes: number };
  probationEnd: { enabled: boolean; days: number };
  contractEnd: { enabled: boolean; days: number };
}

export interface ReminderDay {
  date: string;
  timeZone: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  excused: boolean;
  firstInAt: string | null;
  openNow: boolean;
}

export interface ReminderContract {
  id: string;
  status: string;
  probationEnd: string | null;
  endDate: string | null;
}

export type NoticeKind = "missing_in" | "open_after_end" | "probation_end" | "contract_end";

export interface Notice {
  kind: NoticeKind;
  dedupeKey: string;
  /** Para o colaborador e/ou para a gestão. */
  to: { employee: boolean; managers: boolean; admins: boolean };
  title: string;
  body: string;
  link: string;
}

/** Só se avisa a falta de entrada até 4 h depois do início (não acordar ninguém à meia-noite). */
const MISSING_IN_WINDOW_MIN = 240;

const at = (date: string, hhmm: string, tz: string) => DateTime.fromISO(`${date}T${hhmm}`, { zone: tz });

export function dayNotices(employee: { id: string; name: string }, day: ReminderDay, rules: ReminderRules, nowUtc: string): Notice[] {
  const now = DateTime.fromISO(nowUtc);
  const out: Notice[] = [];
  if (rules.missingIn.enabled && day.plannedStart && !day.firstInAt && !day.excused) {
    const start = at(day.date, day.plannedStart, day.timeZone);
    const due = start.plus({ minutes: rules.missingIn.minutes });
    if (now >= due && now < start.plus({ minutes: MISSING_IN_WINDOW_MIN })) {
      out.push({
        kind: "missing_in",
        dedupeKey: `reminder:missing_in:${employee.id}:${day.date}`,
        to: { employee: true, managers: true, admins: false },
        title: "Entrada por registar",
        body: `${employee.name}: o horário de ${day.date} começou às ${day.plannedStart} e ainda não há entrada registada.`,
        link: `/hr/novo/assiduidade?employeeId=${employee.id}`,
      });
    }
  }
  if (rules.openAfterEnd.enabled && day.plannedStart && day.plannedEnd && day.openNow) {
    const start = at(day.date, day.plannedStart, day.timeZone);
    let end = at(day.date, day.plannedEnd, day.timeZone);
    if (end <= start) end = end.plus({ days: 1 });
    if (now >= end.plus({ minutes: rules.openAfterEnd.minutes })) {
      out.push({
        kind: "open_after_end",
        dedupeKey: `reminder:open_after_end:${employee.id}:${day.date}`,
        to: { employee: true, managers: false, admins: false },
        title: "Saída por registar",
        body: `O horário de ${day.date} terminou às ${day.plannedEnd} e o registo continua aberto. Se já saiu, registe a saída.`,
        link: "/hr/novo/assiduidade",
      });
    }
  }
  return out;
}

export function contractNotices(employee: { id: string; name: string }, contracts: ReminderContract[], rules: ReminderRules, today: string): Notice[] {
  const out: Notice[] = [];
  const within = (date: string | null, days: number) => !!date && date >= today && date <= DateTime.fromISO(today, { zone: "utc" }).plus({ days }).toISODate()!;
  for (const c of contracts.filter((x) => x.status === "active")) {
    if (rules.probationEnd.enabled && within(c.probationEnd, rules.probationEnd.days)) {
      out.push({
        kind: "probation_end",
        dedupeKey: `contract:probation_end:${c.id}:${c.probationEnd}`,
        to: { employee: false, managers: true, admins: true },
        title: "Fim do período experimental",
        body: `${employee.name}: o período experimental termina a ${c.probationEnd}.`,
        link: `/hr/novo/pessoas/${employee.id}`,
      });
    }
    if (rules.contractEnd.enabled && within(c.endDate, rules.contractEnd.days)) {
      out.push({
        kind: "contract_end",
        dedupeKey: `contract:end:${c.id}:${c.endDate}`,
        to: { employee: false, managers: true, admins: true },
        title: "Contrato a terminar",
        body: `${employee.name}: o contrato termina a ${c.endDate}.`,
        link: `/hr/novo/pessoas/${employee.id}`,
      });
    }
  }
  return out;
}

/** Regras efetivas a partir das configurações (`notifications.*`). */
export function rulesFrom(settings: { key: string; value: unknown }[]): ReminderRules {
  const v = (k: string) => settings.find((s) => s.key === `notifications.${k}`)?.value;
  const num = (k: string, d: number) => (typeof v(k) === "number" ? (v(k) as number) : d);
  return {
    missingIn: { enabled: v("reminder.missing_in.enabled") === true, minutes: num("reminder.missing_in.minutes", 15) },
    openAfterEnd: { enabled: v("reminder.open_after_end.enabled") === true, minutes: num("reminder.open_after_end.minutes", 15) },
    probationEnd: { enabled: v("contract.probation_end.enabled") === true, days: num("contract.probation_end.days", 15) },
    contractEnd: { enabled: v("contract.end.enabled") === true, days: num("contract.end.days", 30) },
  };
}
