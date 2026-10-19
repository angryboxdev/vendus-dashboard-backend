import { DateTime } from "luxon";
import type { DemoSchedule } from "../entities/demo-dataset.js";

/**
 * Cenário da organização de demonstração (pedido do utilizador, 2026-10-12):
 * escalas com semanas já publicadas, uma em rascunho e outra por fazer;
 * férias aprovadas a decorrer hoje (aparecem como "Ausentes") e pedidos
 * pendentes para a caixa de Pedidos. Puro: datas relativas a `today`.
 */
export interface ScenarioEmployee {
  id: string;
  key: string;
  locationId: string | null;
  scheduleName: string;
}

export interface ScenarioPlan {
  templates: { name: string; abbreviation: string; color: string; segments: { start: string; end: string }[] }[];
  rosters: {
    locationId: string;
    name: string;
    published: { from: string; to: string };
    draft: { from: string; to: string };
    groups: { templateName: string; employeeIds: string[]; weekdays: string[] }[];
  }[];
  /** Férias já aprovadas (atribuídas pela gestão). */
  approved: { employeeId: string; startDate: string; endDate: string }[];
  /** Pedidos à espera de aprovação (feitos pelo colaborador). */
  pending: { employeeId: string; startDate: string; endDate: string }[];
}

const COLORS: Record<string, string> = { Manhã: "#0EA5E9", Tarde: "#F59E0B", Noite: "#6366F1", "Fecho com limpeza": "#10B981" };
const ABBR = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 3);

const plus = (date: string, n: number) => DateTime.fromISO(date, { zone: "utc" }).plus({ days: n }).toISODate()!;
/** Próximo dia útil (segunda a sexta) a partir da data. */
const weekday = (date: string) => {
  let d = date;
  while (DateTime.fromISO(d, { zone: "utc" }).weekday > 5) d = plus(d, 1);
  return d;
};

export function planScenario(employees: ScenarioEmployee[], schedules: Pick<DemoSchedule, "name" | "start" | "end" | "weekdays">[], today: string): ScenarioPlan {
  const names = [...new Set(schedules.map((s) => s.name))];
  const templates = names.map((name) => {
    const s = schedules.find((x) => x.name === name)!;
    return { name, abbreviation: ABBR(name), color: COLORS[name] ?? "#78716C", segments: [{ start: s.start, end: s.end }] };
  });
  const monday = plus(today, -(DateTime.fromISO(today, { zone: "utc" }).weekday - 1));
  const sorted = [...employees].sort((a, b) => a.key.localeCompare(b.key));
  const byLocation = new Map<string, ScenarioEmployee[]>();
  for (const e of sorted) if (e.locationId) byLocation.set(e.locationId, [...(byLocation.get(e.locationId) ?? []), e]);

  const rosters = [...byLocation].map(([locationId, list], i) => ({
    locationId,
    name: `Escala ${i + 1} (demo)`,
    // Semana passada e a atual publicadas; a próxima em rascunho; a seguinte por fazer.
    published: { from: plus(monday, -7), to: plus(monday, 6) },
    draft: { from: plus(monday, 7), to: plus(monday, 13) },
    groups: names
      .map((templateName) => ({
        templateName,
        employeeIds: list.filter((e) => e.scheduleName === templateName).map((e) => e.id),
        weekdays: schedules.find((s) => s.name === templateName)!.weekdays.map(String),
      }))
      .filter((g) => g.employeeIds.length > 0),
  }));

  // Um colaborador de cada um dos dois primeiros centros de férias a decorrer hoje.
  const firstOf = [...byLocation.values()].map((l) => l[0]!).filter(Boolean);
  const approved = firstOf.slice(0, 2).map((e) => ({ employeeId: e.id, startDate: today, endDate: plus(today, 2) }));
  const taken = new Set(approved.map((a) => a.employeeId));
  const others = sorted.filter((e) => !taken.has(e.id));
  const pending = [
    { offset: 14, days: 5 },
    { offset: 21, days: 1 },
    { offset: 28, days: 2 },
  ]
    .map((p, i) => others[i * 3] && { employeeId: others[i * 3]!.id, startDate: weekday(plus(today, p.offset)), endDate: plus(weekday(plus(today, p.offset)), p.days - 1) })
    .filter((x): x is { employeeId: string; startDate: string; endDate: string } => !!x);
  return { templates, rosters, approved, pending };
}

/** Chave do gerador a partir do e-mail fictício (`nome.apelido.<chave>@demo.invalid`). */
export const keyFromEmail = (email: string | null) => (email?.endsWith("@demo.invalid") ? (email.split("@")[0]!.split(".").at(-1) ?? null) : null);

/**
 * Enriquecimento da demonstração (pedido do utilizador, 2026-10-13, para
 * apresentações): o mês anterior fechado (fecho, assiduidade), regras de
 * alerta, mais pedidos pendentes e aniversários fictícios (alguns já nas
 * próximas semanas). Puro e idempotente do lado de quem aplica (só cria o que
 * falta).
 */
export interface EnrichmentPlan {
  /** Mês anterior completo, a fechar se ainda não houver período nessas datas. */
  closePeriod: { startDate: string; endDate: string };
  alertRules: { kind: "pending_absence" | "pending_correction" | "pending_custom_request" | "pending_swap"; thresholdDays: number; slaHours: number }[];
  /** Mais pedidos de férias à espera (feitos "pelo colaborador"), no futuro. */
  extraPending: { employeeId: string; startDate: string; endDate: string }[];
  /** Data de nascimento fictícia (o ano é inventado; só dia/mês aparecem no Dashboard). */
  birthDates: { employeeId: string; birthDate: string }[];
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export function planEnrichment(employees: ScenarioEmployee[], today: string): EnrichmentPlan {
  const t = DateTime.fromISO(today, { zone: "utc" });
  const prev = t.minus({ months: 1 });
  const closePeriod = { startDate: prev.startOf("month").toISODate()!, endDate: prev.endOf("month").toISODate()! };
  const sorted = [...employees].sort((a, b) => a.key.localeCompare(b.key));
  // Pedidos extra a partir de daqui a 3 semanas (não colidem com os do cenário base).
  const extraPending = sorted
    .filter((_, i) => i % 4 === 3)
    .slice(0, 8)
    .map((e, i) => {
      const start = weekday(plus(today, 21 + i * 4));
      return { employeeId: e.id, startDate: start, endDate: plus(start, i % 2 ? 4 : 1) };
    });
  // Aniversários: os primeiros seis nas próximas semanas; os outros espalhados pelo ano.
  const soon = [0, 2, 5, 9, 14, 21];
  const birthDates = sorted.map((e, i) => {
    const h = hash(e.key);
    const year = 1975 + (h % 26);
    const md = i < soon.length ? t.plus({ days: soon[i]! }) : t.startOf("year").plus({ days: h % 365 });
    const mm = md.toFormat("MM");
    // 29/02 só em ano bissexto: num ano comum passa a 28/02.
    const dd = mm === "02" && md.toFormat("dd") === "29" && year % 4 !== 0 ? "28" : md.toFormat("dd");
    return { employeeId: e.id, birthDate: `${year}-${mm}-${dd}` };
  });
  return {
    closePeriod,
    alertRules: [
      { kind: "pending_absence", thresholdDays: 0, slaHours: 48 },
      { kind: "pending_correction", thresholdDays: 0, slaHours: 24 },
      { kind: "pending_custom_request", thresholdDays: 0, slaHours: 72 },
      { kind: "pending_swap", thresholdDays: 0, slaHours: 24 },
    ],
    extraPending,
    birthDates,
  };
}

/**
 * Manter a demonstração em dia (pedido do utilizador, 2026-10-19 — mais
 * material para apresentações): ~6% de ausências aprovadas a decorrer hoje
 * (escolha estável por pessoa e dia) e as semanas de escala atual (publicada)
 * e seguinte (rascunho) para toda a gente. Puro.
 */
export interface CurrentPlan {
  today: string;
  absencesToday: { employeeId: string; startDate: string; endDate: string }[];
  weeks: { current: { from: string; to: string }; next: { from: string; to: string } };
  rosters: { locationId: string; groups: { templateName: string; employeeIds: string[]; weekdays: string[] }[] }[];
}

export function planCurrent(employees: ScenarioEmployee[], schedules: Pick<DemoSchedule, "name" | "start" | "end" | "weekdays">[], today: string): CurrentPlan {
  const scenario = planScenario(employees, schedules, today);
  const monday = plus(today, -(DateTime.fromISO(today, { zone: "utc" }).weekday - 1));
  const absencesToday = [...employees]
    .sort((a, b) => a.key.localeCompare(b.key))
    .filter((e) => hash(`${today}|${e.key}`) % 100 < 6)
    .map((e) => ({ employeeId: e.id, startDate: today, endDate: plus(today, hash(`len|${today}|${e.key}`) % 3) }));
  return {
    today,
    absencesToday,
    weeks: { current: { from: monday, to: plus(monday, 6) }, next: { from: plus(monday, 7), to: plus(monday, 13) } },
    rosters: scenario.rosters.map((r) => ({ locationId: r.locationId, groups: r.groups })),
  };
}
