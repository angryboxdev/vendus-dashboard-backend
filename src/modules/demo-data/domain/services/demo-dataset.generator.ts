import { DateTime } from "luxon";
import type {
  DemoCenter,
  DemoDataset,
  DemoDatasetOptions,
  DemoEmployee,
  DemoPosition,
  DemoPunch,
  DemoSchedule,
  DemoTenant,
  PunchKind,
} from "../entities/demo-dataset.js";

/**
 * Gerador determinístico (mesma semente → mesmo conjunto, byte a byte).
 * Sem valores legais: não gera feriados, limites de horas nem dias de
 * férias — isso é configuração (task RH §4.5) e entra com o motor de
 * configurações, com `a_validar = true`.
 *
 * Casos difíceis incluídos de propósito, para as fases 3–4:
 * - turnos que passam a meia-noite (RE-6/RE-7/RE-8);
 * - centros em Europe/Lisbon e Europe/Madrid (TK-12);
 * - o período por defeito atravessa a mudança de hora de outubro.
 */

/** PRNG pequeno e estável (mulberry32). */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Ana", "Beatriz", "Carla", "Diana", "Elisa", "Filipa", "Inês", "Joana", "Lara", "Marta",
  "Nuria", "Olga", "Paula", "Rita", "Sara", "Teresa", "Lucía", "Carmen", "Alba", "Irene",
  "André", "Bruno", "Carlos", "Daniel", "Eduardo", "Fábio", "Gonçalo", "Hugo", "Ivo", "João",
  "Luís", "Miguel", "Nuno", "Pedro", "Rui", "Tiago", "Javier", "Pablo", "Sergio", "Álvaro",
];
/** Os primeiros 20 nomes são femininos; os outros, masculinos (para escolher a foto). */
const FEMALE_NAMES = new Set(FIRST_NAMES.slice(0, 20));
/** Fotos fictícias por grupo (`public/demo-avatars/{f|m}-NN.svg` no frontend). */
export const DEMO_AVATARS_PER_GROUP = 12;
/** Foto da n-ésima pessoa do grupo (cíclica; não consome o gerador aleatório). */
export function demoAvatarPath(firstName: string, n: number): string {
  const group = FEMALE_NAMES.has(firstName) ? "f" : "m";
  return `demo-avatars/${group}-${pad((n % DEMO_AVATARS_PER_GROUP) + 1, 2)}.svg`;
}

const LAST_NAMES = [
  "Almeida", "Barros", "Cardoso", "Dias", "Esteves", "Faria", "Gomes", "Henriques", "Lopes", "Matos",
  "Neves", "Pires", "Queirós", "Ramos", "Santos", "Teixeira", "Vaz", "García", "Martín", "Ruiz",
  "Navarro", "Moreno", "Ortega", "Delgado", "Castro", "Vidal", "Serrano", "Molina", "Rubio", "Iglesias",
];

const TENANTS: DemoTenant[] = [
  { key: "t1", name: "Demonstração Norte", synthetic: true },
  { key: "t2", name: "Demonstração Ibérica", synthetic: true },
];

const CENTERS: DemoCenter[] = [
  { key: "t1-c1", tenantKey: "t1", name: "Centro Demo Porto", country: "PT", timeZone: "Europe/Lisbon", synthetic: true },
  { key: "t1-c2", tenantKey: "t1", name: "Centro Demo Oviedo", country: "ES", timeZone: "Europe/Madrid", synthetic: true },
  { key: "t2-c1", tenantKey: "t2", name: "Centro Demo Braga", country: "PT", timeZone: "Europe/Lisbon", synthetic: true },
  { key: "t2-c2", tenantKey: "t2", name: "Centro Demo Barcelona", country: "ES", timeZone: "Europe/Madrid", synthetic: true },
];

const POSITION_NAMES = ["Operador", "Chefe de equipa", "Técnico", "Administrativo"];

const SCHEDULE_TEMPLATES: Omit<DemoSchedule, "key" | "tenantKey">[] = [
  { name: "Manhã", start: "07:00", end: "15:00", endsNextDay: false, weekdays: [1, 2, 3, 4, 5] },
  { name: "Tarde", start: "15:00", end: "23:00", endsNextDay: false, weekdays: [1, 2, 3, 4, 5] },
  { name: "Noite", start: "22:00", end: "06:00", endsNextDay: true, weekdays: [1, 2, 3, 4, 5] },
  { name: "Fecho com limpeza", start: "18:00", end: "00:45", endsNextDay: true, weekdays: [3, 4, 5, 6, 7] },
];

const pick = <T>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function generateDemoDataset(options: DemoDatasetOptions): DemoDataset {
  const rnd = createRandom(options.seed);
  const positions: DemoPosition[] = TENANTS.flatMap((t) =>
    POSITION_NAMES.map((name, i) => ({ key: `${t.key}-p${i + 1}`, tenantKey: t.key, name })),
  );
  const schedules: DemoSchedule[] = TENANTS.flatMap((t) =>
    SCHEDULE_TEMPLATES.map((s, i) => ({ ...s, key: `${t.key}-s${i + 1}`, tenantKey: t.key })),
  );

  const employees: DemoEmployee[] = [];
  const avatarCount = { f: 0, m: 0 };
  for (const center of CENTERS) {
    for (let i = 1; i <= options.employeesPerCenter; i++) {
      const firstName = pick(rnd, FIRST_NAMES);
      const lastName = `${pick(rnd, LAST_NAMES)} ${pick(rnd, LAST_NAMES)}`;
      const key = `${center.key}-e${pad(i, 3)}`;
      const hire = DateTime.fromISO("2019-01-01", { zone: "utc" }).plus({ days: Math.floor(rnd() * 2400) });
      employees.push({
        key,
        tenantKey: center.tenantKey,
        centerKey: center.key,
        positionKey: `${center.tenantKey}-p${1 + Math.floor(rnd() * POSITION_NAMES.length)}`,
        scheduleKey: `${center.tenantKey}-s${1 + Math.floor(rnd() * SCHEDULE_TEMPLATES.length)}`,
        employeeNumber: `DEMO-${center.key.toUpperCase()}-${pad(i, 4)}`,
        firstName,
        lastName,
        email: `${ascii(firstName)}.${ascii(lastName.split(" ")[0]!)}.${key}@demo.invalid`,
        hireDate: hire.toISODate()!,
        photoPath: demoAvatarPath(firstName, avatarCount[FEMALE_NAMES.has(firstName) ? "f" : "m"]++),
        synthetic: true,
      });
    }
  }

  const punches = generatePunches({ seed: options.seed, employees, schedules, from: options.from, to: options.to });

  return {
    seed: options.seed,
    period: { from: options.from, to: options.to },
    tenants: TENANTS,
    centers: CENTERS,
    positions,
    schedules,
    employees,
    punches,
  };
}

/** Tipo de marcação no motor de ponto para cada marcação do gerador. */
export const PUNCH_SEGMENT: Record<PunchKind, "work" | "break_unpaid" | "off"> = { in: "work", back: "work", break: "break_unpaid", out: "off" };

/** Semente estável por texto (FNV-1a): o mesmo colaborador e dia dão sempre as mesmas marcações. */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Marcações de um período, reprodutíveis por colaborador e dia (para se
 * poderem acrescentar mais tarde sem duplicar — o `clientEventId` é fixo).
 * A maioria entra a horas (até 10 min antes); ~22% chega 6–40 min tarde;
 * ~10% falta (mais exceções para apresentações — 2026-10-13); ~3% esquece a saída; turnos de 6 h+ fazem muitas vezes uma
 * pausa de 20–40 min a meio. Com `nowUtc`, nada depois desse instante.
 */
export function generatePunches(input: { seed: number; employees: DemoEmployee[]; schedules: DemoSchedule[]; from: string; to: string; nowUtc?: string }): DemoPunch[] {
  const centerByKey = new Map(CENTERS.map((c) => [c.key, c]));
  const scheduleByKey = new Map(input.schedules.map((s) => [s.key, s]));
  const out: DemoPunch[] = [];
  const from = DateTime.fromISO(input.from);
  const to = DateTime.fromISO(input.to);
  for (const e of input.employees) {
    const zone = centerByKey.get(e.centerKey)!.timeZone;
    const s = scheduleByKey.get(e.scheduleKey)!;
    for (let d = from; d <= to; d = d.plus({ days: 1 })) {
      if (!s.weekdays.includes(d.weekday)) continue;
      const workDate = d.toISODate()!;
      const rnd = createRandom(hashSeed(`${input.seed}|${e.key}|${workDate}`));
      if (rnd() < 0.1) continue; // falta — aparece no Painel e na Assiduidade
      const start = DateTime.fromISO(`${workDate}T${s.start}`, { zone });
      let end = DateTime.fromISO(`${workDate}T${s.end}`, { zone });
      if (s.endsNextDay) end = end.plus({ days: 1 });
      const late = rnd() < 0.22;
      const inAt = late ? start.plus({ minutes: 6 + Math.floor(rnd() * 35) }) : start.minus({ minutes: Math.floor(rnd() * 11) });
      const outAt = end.plus({ minutes: Math.floor(rnd() * 26) - 5 });
      const forgotOut = rnd() < 0.03;
      const withBreak = end.diff(start, "hours").hours >= 6 && rnd() < 0.7;
      const mid = start.plus({ milliseconds: end.diff(start).milliseconds / 2 }).plus({ minutes: Math.floor(rnd() * 31) - 15 });
      const breakEnd = mid.plus({ minutes: 20 + Math.floor(rnd() * 21) });
      const push = (kind: PunchKind, at: DateTime) => out.push({ employeeKey: e.key, kind, atUtc: at.toUTC().toISO()!, timeZone: zone, workDate, clientEventId: `${e.key}-${workDate}-${kind}` });
      push("in", inAt);
      if (withBreak) {
        push("break", mid);
        push("back", breakEnd);
      }
      if (!forgotOut) push("out", outAt);
    }
  }
  return input.nowUtc ? out.filter((p) => p.atUtc <= input.nowUtc!) : out;
}
