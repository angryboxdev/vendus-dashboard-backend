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
