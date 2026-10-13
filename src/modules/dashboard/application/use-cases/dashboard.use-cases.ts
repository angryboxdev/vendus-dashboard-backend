import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { TEAM_CATEGORIES, type DashboardLayout, type DashboardPerson, type OperationalSnapshot, type TeamCategory } from "../../domain/entities/dashboard.js";
import type { DashboardCachePort, DashboardLayoutRepositoryPort, DashboardSourcesPort, DashboardViewer } from "../../domain/ports/out/dashboard.ports.js";
import type { CoverageGap, DashboardRequest } from "../../domain/entities/dashboard.js";
import { attentionItems, mergeLayout, teamCategory, teamCounts, unitRows, validateLayout } from "../../domain/services/snapshot.service.js";

export class DashboardForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardForbiddenError";
  }
}
export class DashboardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardValidationError";
  }
}

/** TTL da operação ao vivo (presenças, pedidos, cobertura). */
export const LIVE_TTL_MS = 45_000;
const TEAM_PAGE = 50;
/** Tempo máximo para a cobertura (muitas pessoas): passado isto, o snapshot sai sem ela. */
export const COVERAGE_BUDGET_MS = 8_000;

const withBudget = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms} ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
const BIRTHDAY_DAYS = 30;
export const DASHBOARD_KEY = "novo-rh.home";

/**
 * Dashboard executivo: agrega as fontes canónicas (painel, caixa de pedidos,
 * escalas) num `OperationalSnapshot` — um só pedido para todos os widgets
 * operacionais. Listas detalhadas só a pedido. Não decide regras.
 */
export class DashboardUseCases {
  constructor(
    private readonly sources: DashboardSourcesPort,
    private readonly layouts: DashboardLayoutRepositoryPort,
    private readonly cache: DashboardCachePort,
    private readonly onSourceError: (source: string, error: unknown) => void = () => {},
    private readonly coverageBudgetMs: number = COVERAGE_BUDGET_MS,
  ) {}

  private async people(org: OrganizationId, viewer: DashboardViewer) {
    // O dia vem da fonte; a chave usa "hoje" do relógio da própria fonte na carga.
    return this.cache.getOrLoad({ org, metric: "PEOPLE", date: "today", viewer: viewer.userId, context: "organization" }, LIVE_TTL_MS, () => viewer.people());
  }

  async snapshot(org: OrganizationId, viewer: DashboardViewer, locationId: string | null): Promise<OperationalSnapshot & { cacheHits: number; timings: Record<string, number> }> {
    const partial: OperationalSnapshot["partial"] = [];
    const timings: Record<string, number> = {};
    const timed = <T>(name: string, p: Promise<T>): Promise<T> => {
      const t0 = Date.now();
      return p.finally(() => (timings[name] = Date.now() - t0));
    };
    // Só as pessoas são indispensáveis; pedidos e cobertura degradam com aviso.
    const [peopleRes, requestsRes] = await Promise.all([
      timed("people", this.people(org, viewer)),
      timed("requests", this.cache.getOrLoad({ org, metric: "REQUESTS", date: "today", viewer: viewer.userId, context: "organization" }, LIVE_TTL_MS, () => withBudget(viewer.requests(), this.coverageBudgetMs)))
        .catch((e): { value: DashboardRequest[]; hit: boolean } => (this.onSourceError("requests", e), partial.push("requests"), { value: [], hit: false })),
    ]);
    const { today, people: all, holidays } = peopleRes.value;
    const tomorrow = this.sources.tomorrowOf(today);
    const coverageRes = await timed("coverage", this.cache
      .getOrLoad({ org, metric: "COVERAGE", date: today, viewer: viewer.userId, context: "organization" }, LIVE_TTL_MS, () =>
        withBudget(
          this.sources.coverage(
            org,
            all.map((p) => ({ id: p.employeeId, name: p.name, locationId: p.locationId })),
            today,
            tomorrow,
          ),
          this.coverageBudgetMs,
        ),
      )
      .catch((e): { value: CoverageGap[]; hit: boolean } => (this.onSourceError("coverage", e), partial.push("coverage"), { value: [], hit: false })));
    const known = new Map(all.filter((p) => p.locationId).map((p) => [p.locationId!, p.locationName ?? "—"]));
    if (locationId && !known.has(locationId)) throw new DashboardValidationError("Local fora do seu âmbito.");
    const inCtx = <T extends { locationId?: string | null }>(xs: T[]) => (locationId ? xs.filter((x) => x.locationId === locationId) : xs);
    const people = inCtx(all);
    const gaps = inCtx(coverageRes.value);
    const locOf = new Map(all.map((p) => [p.employeeId, p.locationId]));
    const requests = locationId ? requestsRes.value.filter((r) => locOf.get(r.employeeId) === locationId) : requestsRes.value;
    const team = teamCounts(people);
    const uncoveredToday = gaps.filter((g) => g.date === today).length;
    const uncoveredTomorrow = gaps.filter((g) => g.date === tomorrow).length;
    const locations = unitRows(people, gaps, requests, today, [...known].map(([id, name]) => ({ id, name })));
    return {
      generatedAt: new Date().toISOString(),
      context: { type: locationId ? "location" : "organization", locationId, name: locationId ? (known.get(locationId) ?? null) : null },
      localDate: today,
      tomorrow,
      units: { operational: locations.length, requiringAttention: locations.filter((l) => l.state !== "normal").length },
      team,
      coverage: { uncoveredToday, uncoveredTomorrow, uncoveredTotal: uncoveredToday + uncoveredTomorrow },
      requests: { pending: requests.length, decidable: requests.filter((r) => r.canDecide).length },
      attention: attentionItems(team, uncoveredToday, requests),
      locations,
      holidays,
      partial,
      timings,
      cacheHits: [peopleRes, requestsRes, coverageRes].filter((r) => r.hit).length,
    };
  }

  /** Detalhe de uma categoria do "Estado da equipa" (lista autorizada, paginada). */
  async team(org: OrganizationId, viewer: DashboardViewer, input: { category: string; locationId: string | null; q: string; page: number }) {
    if (!TEAM_CATEGORIES.includes(input.category as TeamCategory)) throw new DashboardValidationError("Categoria inválida.");
    const { value } = await this.people(org, viewer);
    const norm = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const q = norm(input.q.trim());
    const rows = value.people
      .filter((p) => teamCategory(p) === input.category && (!input.locationId || p.locationId === input.locationId) && (!q || norm(p.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt"));
    const page = Math.max(1, input.page);
    const show = (p: DashboardPerson) => ({
      employeeId: p.employeeId,
      name: p.name,
      locationId: p.locationId,
      locationName: p.locationName,
      plannedStart: p.plannedStart,
      plannedEnd: p.plannedEnd,
      firstInAt: p.firstInAt,
      lateMinutes: p.lateMinutes,
      // Tipo de ausência só nas categorias de ausência e já mascarado pela fonte quando privado.
      absenceType: input.category === "absent" || input.category === "vacation" ? p.absenceType : null,
    });
    return { total: rows.length, page, pageSize: TEAM_PAGE, items: rows.slice((page - 1) * TEAM_PAGE, page * TEAM_PAGE).map(show) };
  }

  /**
   * Próximos aniversários (30 dias): só dia e mês, nunca o ano/idade, e só a
   * quem pode ver a data de nascimento; só pessoas no âmbito.
   */
  async birthdays(org: OrganizationId, viewer: DashboardViewer) {
    if (!viewer.canSeeBirthdays) throw new DashboardForbiddenError("Sem permissão para ver datas de nascimento.");
    const { value } = await this.people(org, viewer);
    const today = value.today;
    const out: { employeeId: string; name: string; locationName: string | null; day: number; month: number; date: string }[] = [];
    for (const e of await this.sources.birthDates(org)) {
      if (!e.birthDate || !(await viewer.canSee(e.employeeId, today))) continue;
      const next = nextBirthday(e.birthDate, today);
      if (!next || daysBetween(today, next) > BIRTHDAY_DAYS) continue;
      out.push({ employeeId: e.employeeId, name: e.name, locationName: e.locationName, day: Number(next.slice(8, 10)), month: Number(next.slice(5, 7)), date: next });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pt"));
  }

  async layout(org: OrganizationId, userId: string): Promise<DashboardLayout & { custom: boolean }> {
    const saved = await this.layouts.get(org, userId, DASHBOARD_KEY);
    return { ...mergeLayout(saved), custom: !!saved };
  }
  async saveLayout(org: OrganizationId, userId: string, input: unknown) {
    let layout: DashboardLayout;
    try {
      layout = validateLayout(input);
    } catch (e) {
      throw new DashboardValidationError(e instanceof Error ? e.message : "Layout inválido.");
    }
    await this.layouts.save(org, userId, DASHBOARD_KEY, layout);
    return this.layout(org, userId);
  }
  async resetLayout(org: OrganizationId, userId: string) {
    await this.layouts.remove(org, userId, DASHBOARD_KEY);
    return this.layout(org, userId);
  }
}

const dayNum = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);

/** Próximo aniversário (AAAA-MM-DD) a partir de hoje; 29/02 passa a 28/02 em anos comuns. */
export function nextBirthday(birthDate: string, today: string): string | null {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(birthDate);
  if (!m) return null;
  const at = (year: number) => {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const day = m[1] === "02" && m[2] === "29" && !leap ? "28" : m[2];
    return `${year}-${m[1]}-${day}`;
  };
  const year = Number(today.slice(0, 4));
  const thisYear = at(year);
  return thisYear >= today ? thisYear : at(year + 1);
}
