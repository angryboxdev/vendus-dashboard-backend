import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Overview, PersonOverview, PlanCell, TeamPlan } from "../../domain/entities/overview.js";
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
/** "Só hoje" (Dashboard): um dia por pessoa, mais pessoas em paralelo. */
const TODAY_CONCURRENCY = 16;
/** Último resultado de "hoje" ainda servível (atualiza em segundo plano) — o painel abre logo. */
const TODAY_STALE_MS = 10 * 60_000;
const PLAN_MAX_DAYS = 14;

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
  private readonly cache = new Map<string, { at: number; value: Promise<Omit<Overview, "kpis" | "locations" | "week">>; settled?: boolean; refreshing?: boolean }>();

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
    // Âmbito de quem vê: em paralelo (antes uma pessoa de cada vez); a ordem mantém-se.
    const seen = await mapLimit(base.people, CONCURRENCY, (p) => viewer.canSee(p.employeeId, day));
    const visible: PersonOverview[] = base.people.filter((_, i) => seen[i]);
    const dates = Array.from({ length: WEEK_DAYS }, (_, i) => plus(day, i - WEEK_DAYS + 1));
    return { ...base, people: visible, kpis: kpis(visible), locations: byLocation(visible), week: weekTrend(visible, dates) };
  }

  /**
   * Horários planeados da equipa (FE-031): horário, feriado e ausência por
   * pessoa e dia, até ${PLAN_MAX_DAYS} dias (passados ou futuros). Mesma fonte do apuramento.
   */
  async plan(org: OrganizationId, viewer: OverviewViewer, from: string, to: string): Promise<TeamPlan> {
    for (const d of [from, to]) if (!DATE.test(d) || !DateTime.fromISO(d).isValid) throw new OverviewValidationError("Data inválida.");
    if (to < from) throw new OverviewValidationError("O fim tem de ser depois do início.");
    if (DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days + 1 > PLAN_MAX_DAYS) throw new OverviewValidationError(`No máximo ${PLAN_MAX_DAYS} dias.`);
    const [employees, locations, absences] = await Promise.all([this.sources.employees(org), this.sources.locations(org), this.sources.absences(org, from, to, viewer.canPrivate)]);
    // Âmbito de quem vê: verificado em paralelo (antes era uma pessoa de cada vez).
    const seen = await mapLimit(employees, CONCURRENCY, (e) => viewer.canSee(e.id, from));
    const visible = employees.filter((_, i) => seen[i]);
    const locName = new Map(locations.map((l) => [l.id, l.name]));
    const many = this.sources.daysMany ? await this.sources.daysMany(org, visible.map((e) => e.id), from, to, CONCURRENCY) : null;
    const people = await mapLimit(visible, CONCURRENCY, async (e) => {
      const { days } = many?.get(e.id) ?? (await this.sources.days(org, e.id, from, to));
      const cells: PlanCell[] = days.map((d) => {
        const absenceType = absenceOn(absences, e.id, d.workDate);
        return { date: d.workDate, plannedStart: d.plannedStart, plannedEnd: d.plannedEnd, theoreticalSeconds: d.theoreticalSeconds, absenceType, holiday: d.excused && !absenceType };
      });
      return { employeeId: e.id, name: e.name, locationId: e.locationId, locationName: e.locationId ? (locName.get(e.locationId) ?? null) : null, days: cells, unplanned: cells.every((c) => c.theoreticalSeconds <= 0 && !c.absenceType && !c.holiday) };
    });
    return { from, to, people: people.sort((a, b) => Number(b.unplanned) - Number(a.unplanned) || a.name.localeCompare(b.name, "pt")) };
  }

  /**
   * Só o dia de hoje (sem a semana): o mesmo apuramento e as mesmas regras,
   * com ~7× menos trabalho por pessoa. Usado pelo Dashboard executivo.
   */
  async today(org: OrganizationId, viewer: OverviewViewer): Promise<Pick<Overview, "date" | "today" | "generatedAt" | "people" | "holidays">> {
    const today = await this.sources.today(org);
    const key = `${org}|${today}|${viewer.canPrivate ? 1 : 0}|day`;
    const load = () => {
      const entry: { at: number; value: Promise<Omit<Overview, "kpis" | "locations" | "week">>; settled?: boolean; refreshing?: boolean } = { at: this.now(), value: this.build(org, today, today, viewer.canPrivate, 1, TODAY_CONCURRENCY) };
      entry.value.then(
        () => (entry.settled = true),
        () => (this.cache.get(key) === entry ? this.cache.delete(key) : undefined),
      );
      return entry;
    };
    let hit = this.cache.get(key);
    const age = hit ? this.now() - hit.at : Infinity;
    if (!hit || age >= TODAY_STALE_MS || (age >= CACHE_MS && !hit.settled)) {
      hit = load();
      this.cache.set(key, hit);
    } else if (age >= CACHE_MS && !hit.refreshing) {
      // Stale-while-revalidate: devolve o último resultado já e recalcula em segundo plano.
      hit.refreshing = true;
      const next = load();
      next.value.then(() => this.cache.set(key, next)).catch(() => void (hit!.refreshing = false));
    }
    const base = await hit.value;
    // Âmbito de quem vê: em paralelo (antes uma pessoa de cada vez); a ordem mantém-se.
    const seen = await mapLimit(base.people, CONCURRENCY, (p) => viewer.canSee(p.employeeId, today));
    const visible: PersonOverview[] = base.people.filter((_, i) => seen[i]);
    return { date: base.date, today: base.today, generatedAt: base.generatedAt, people: visible, holidays: base.holidays };
  }

  /** Esquece o "hoje" de uma organização (houve marcações/ausências): o próximo pedido recalcula. */
  invalidateToday(org: OrganizationId): void {
    for (const k of [...this.cache.keys()]) if (k.startsWith(`${org}|`) && k.endsWith("|day")) this.cache.delete(k);
  }

  private async build(org: OrganizationId, day: string, today: string, canPrivate: boolean, span: number = WEEK_DAYS, concurrency: number = CONCURRENCY) {
    const from = plus(day, -(span - 1));
    const [employees, locations, absences, pending, holidays] = await Promise.all([
      this.sources.employees(org),
      this.sources.locations(org),
      this.sources.absences(org, from, day, canPrivate),
      this.sources.pending(org),
      this.sources.holidays(org, today, 4),
    ]);
    const locName = new Map(locations.map((l) => [l.id, l.name]));
    let timeZone = "Europe/Lisbon";
    // Em lote quando a fonte o permite (marcações/revisões/incidentes numa leitura, não três por pessoa).
    const many = this.sources.daysMany ? await this.sources.daysMany(org, employees.map((e) => e.id), from, day, concurrency) : null;
    const people = await mapLimit(employees, concurrency, async (e): Promise<PersonOverview> => {
      const res = many?.get(e.id) ?? (await this.sources.days(org, e.id, from, day));
      timeZone = res.timeZone;
      const days = res.days;
      const week = days.map((d) => dayView(d, absenceOn(absences, e.id, d.workDate), today));
      const current = week.find((d) => d.date === day) ?? dayView({ workDate: day, workedSeconds: 0, theoreticalSeconds: 0, plannedStart: null, plannedEnd: null, excused: false, firstInAt: null, lateMinutes: 0, startPassed: false, openType: null, segments: [] }, null, today);
      const segments = days.find((d) => d.workDate === day)?.segments ?? [];
      const absenceCategory = absences.find((a) => a.employeeId === e.id && a.startDate <= day && a.endDate >= day)?.category ?? null;
      return { ...current, absenceCategory, employeeId: e.id, name: e.name, locationId: e.locationId, locationName: e.locationId ? (locName.get(e.locationId) ?? null) : null, week, segments };
    });
    return { date: day, today, timeZone, generatedAt: new Date(this.now()).toISOString(), people: sortPeople(people), pending, holidays };
  }
}
