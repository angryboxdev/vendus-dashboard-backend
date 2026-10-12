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
        synthetic: true,
      });
    }
  }

  const centerByKey = new Map(CENTERS.map((c) => [c.key, c]));
  const scheduleByKey = new Map(schedules.map((s) => [s.key, s]));
  const punches: DemoPunch[] = [];
  const from = DateTime.fromISO(options.from);
  const to = DateTime.fromISO(options.to);
  for (const e of employees) {
    const zone = centerByKey.get(e.centerKey)!.timeZone;
    const s = scheduleByKey.get(e.scheduleKey)!;
    for (let d = from; d <= to; d = d.plus({ days: 1 })) {
      if (!s.weekdays.includes(d.weekday)) continue;
      if (rnd() < 0.04) continue; // falta ocasional — gera ocorrências para a Assiduidade
      const workDate = d.toISODate()!;
      const start = DateTime.fromISO(`${workDate}T${s.start}`, { zone });
      let end = DateTime.fromISO(`${workDate}T${s.end}`, { zone });
      if (s.endsNextDay) end = end.plus({ days: 1 });
      // Desvios realistas: -8..+12 min na entrada, -5..+25 min na saída.
      const inAt = start.plus({ minutes: Math.floor(rnd() * 21) - 8 });
      const outAt = end.plus({ minutes: Math.floor(rnd() * 31) - 5 });
      const forgotOut = rnd() < 0.02; // esquecimento de saída
      punches.push({ employeeKey: e.key, kind: "in", atUtc: inAt.toUTC().toISO()!, timeZone: zone, workDate, clientEventId: `${e.key}-${workDate}-in` });
      if (!forgotOut) {
        punches.push({ employeeKey: e.key, kind: "out", atUtc: outAt.toUTC().toISO()!, timeZone: zone, workDate, clientEventId: `${e.key}-${workDate}-out` });
      }
    }
  }

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
