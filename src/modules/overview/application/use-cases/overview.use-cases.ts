import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Overview, PersonOverview } from "../../domain/entities/overview.js";
import type { OverviewSourcesPort } from "../../domain/ports/out/overview.ports.js";
import { absenceOn, byLocation, dayView, kpis, sortPeople, weekTrend } from "../../domain/services/overview.service.js";

export class OverviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverviewValidationError";
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_DAYS = 7;
/** Cache curta por organização/dia: o painel é aberto muitas vezes e o apuramento custa vários pedidos por pessoa. */
const CACHE_MS = 30_000;
const CONCURRENCY = 6;

export interface OverviewViewer {
  /** Âmbito (RE-34): só aparecem as pessoas que o utilizador pode ver. */
  canSee: (employeeId: string, date: string) => Promise<boolean>;
  canPrivate: boolean;
}

const plus = (date: string, days: number) => DateTime.fromISO(date, { zone: "utc" }).plus({ days }).toISODate()!;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export class OverviewUseCases {
  private readonly cache = new Map<string, { at: number; value: Promise<Omit<Overview, "kpis" | "locations" | "week">> }>();

  constructor(
    private readonly sources: OverviewSourcesPort,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Painel de um dia (por omissão, hoje no fuso da organização). */
  async get(org: OrganizationId, viewer: OverviewViewer, date: string | null): Promise<Overview> {
    const today = await this.sources.today(org);
    const day = date ?? today;
    if (!DATE.test(day) || !DateTime.fromISO(day).isValid) throw new OverviewValidationError("Data inválida.");
    if (day > today) throw new OverviewValidationError("O painel não mostra dias futuros.");

    const key = `${org}|${day}|${viewer.canPrivate ? 1 : 0}`;
    let hit = this.cache.get(key);
    if (!hit || this.now() - hit.at >= CACHE_MS) {
      hit = { at: this.now(), value: this.build(org, day, today, viewer.canPrivate) };
      this.cache.set(key, hit);
      hit.value.catch(() => this.cache.delete(key));
    }
    const base = await hit.value;
    const visible: PersonOverview[] = [];
    for (const p of base.people) if (await viewer.canSee(p.employeeId, day)) visible.push(p);
    const dates = Array.from({ length: WEEK_DAYS }, (_, i) => plus(day, i - WEEK_DAYS + 1));
    return { ...base, people: visible, kpis: kpis(visible), locations: byLocation(visible), week: weekTrend(visible, dates) };
  }

  private async build(org: OrganizationId, day: string, today: string, canPrivate: boolean) {
    const from = plus(day, -(WEEK_DAYS - 1));
    const [employees, locations, absences, pending, holidays] = await Promise.all([
      this.sources.employees(org),
      this.sources.locations(org),
      this.sources.absences(org, from, day, canPrivate),
      this.sources.pending(org),
      this.sources.holidays(org, today, 4),
    ]);
    const locName = new Map(locations.map((l) => [l.id, l.name]));
    let timeZone = "Europe/Lisbon";
    const people = await mapLimit(employees, CONCURRENCY, async (e): Promise<PersonOverview> => {
      const res = await this.sources.days(org, e.id, from, day);
      timeZone = res.timeZone;
      const days = res.days;
      const week = days.map((d) => dayView(d, absenceOn(absences, e.id, d.workDate), today));
      const current = week.find((d) => d.date === day) ?? dayView({ workDate: day, workedSeconds: 0, theoreticalSeconds: 0, plannedStart: null, plannedEnd: null, excused: false, firstInAt: null, lateMinutes: 0, startPassed: false, openType: null }, null, today);
      return { ...current, employeeId: e.id, name: e.name, locationId: e.locationId, locationName: e.locationId ? (locName.get(e.locationId) ?? null) : null, week };
    });
    return { date: day, today, timeZone, generatedAt: new Date(this.now()).toISOString(), people: sortPeople(people), pending, holidays };
  }
}
