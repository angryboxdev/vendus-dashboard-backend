import { DateTime } from "luxon";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { DemoOrgError, type DemoOrg } from "../../domain/entities/demo-org.js";
import type { DemoLivePort, DemoOrgRepositoryPort, DemoOrgSupportPort, DemoScenarioPort, DemoSeedPort } from "../../domain/ports/out/demo-org.ports.js";
import { generateDemoDataset, generatePunches, PUNCH_SEGMENT } from "../../domain/services/demo-dataset.generator.js";
import { keyFromEmail, planCurrent, planEnrichment, planScenario } from "../../domain/services/demo-scenario.js";

const SEED = 20261012;
/** 4 centros × 28 = 112 colaboradores fictícios (pedido 2026-10-19: mais de 100 para apresentações). */
const EMPLOYEES_PER_CENTER = 28;
/** Marcações mantidas em dia: últimos 30 dias (e sempre o mês anterior inteiro, para o fecho) até agora. */
const WINDOW_DAYS = 30;
/** Cache curto da ligação real → demo (lida em cada pedido em modo Demonstração). */
const CACHE_MS = 60_000;
/** Atualização automática no máximo de 10 em 10 minutos por organização. */
const REFRESH_MS = 10 * 60_000;

export interface DemoActor {
  userId: string;
  email: string;
}

export class DemoOrgUseCases {
  private readonly cache = new Map<string, { at: number; demo: DemoOrg | null }>();
  private readonly refreshed = new Map<string, number>();
  private readonly running = new Map<string, Promise<unknown>>();
  private readonly runningSince = new Map<string, number>();
  /** Última atualização por organização demo (para o ecrã mostrar o que aconteceu). */
  private readonly lastRun = new Map<string, { at: string; result: unknown; error: string | null }>();

  constructor(
    private readonly repo: DemoOrgRepositoryPort,
    private readonly seeder: DemoSeedPort,
    private readonly support: DemoOrgSupportPort,
    private readonly live: DemoLivePort,
    private readonly scenario: DemoScenarioPort,
    private readonly now: () => number = () => Date.now(),
    /** Colaboradores por centro (os testes de protocolo usam uma demo pequena). */
    private readonly perCenter: number = EMPLOYEES_PER_CENTER,
  ) {}

  async status(realOrg: OrganizationId) {
    const demo = await this.repo.demoOf(realOrg);
    const last = demo ? this.lastRun.get(demo.id) : undefined;
    return { exists: !!demo, name: demo?.name ?? null, refresh: { running: !!demo && this.running.has(demo.id), lastAt: last?.at ?? null, last: last?.result ?? null, error: last?.error ?? null } };
  }

  /** Para o middleware: a organização demo ligada a esta organização real (ou null). */
  async resolve(realOrg: OrganizationId): Promise<OrganizationId | null> {
    const hit = this.cache.get(realOrg);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.demo?.id ?? null;
    const demo = await this.repo.demoOf(realOrg);
    this.cache.set(realOrg, { at: this.now(), demo });
    return demo?.id ?? null;
  }

  /**
   * Criar a organização de demonstração e carregar os dados fictícios
   * (centros, cargos, horários, colaboradores, contratos, feriados de PT,
   * tipos de ausência) e logo a seguir o cenário e as marcações até agora.
   */
  async create(realOrg: OrganizationId, actor: DemoActor & { isAdmin: boolean }) {
    if (!actor.isAdmin) throw new DemoOrgError("Só um Admin pode criar a organização de demonstração.", "admin_only");
    const real = await this.repo.organization(realOrg);
    if (!real) throw new DemoOrgError("Organização não encontrada.", "not_found");
    if (real.isDemo) throw new DemoOrgError("Esta já é uma organização de demonstração.", "is_demo");
    if (await this.repo.demoOf(realOrg)) throw new DemoOrgError("A organização de demonstração já existe.", "already_exists");

    const demo = await this.repo.createDemo(realOrg, { name: `${real.name} — Demonstração`, nif: `DEMO-${realOrg.slice(0, 8).toUpperCase()}` });
    this.cache.delete(realOrg);
    const today = await this.support.today(realOrg);
    // As marcações entram no refresh, depois das ausências do cenário (ninguém pica de férias).
    const dataset = { ...generateDemoDataset({ seed: SEED, employeesPerCenter: this.perCenter, from: today, to: today }), punches: [] };
    const summary = await this.seeder.seed(demo.id, dataset, { actor: actor.email, year: Number(today.slice(0, 4)) });
    const live = await this.update(demo.id, actor, today);
    await this.support.audit(realOrg, { actor: actor.email, action: "demo.organization.create", resourceId: demo.id, after: { name: demo.name, ...summary, ...live } });
    return { demo, summary: { ...summary, clockEvents: live.punches } };
  }

  /**
   * Manter a demonstração "viva": cria o cenário se faltar (escalas e
   * ausências) e acrescenta as marcações em falta até agora. Idempotente
   * (as marcações têm id fixo); sem `force`, no máximo de 10 em 10 minutos.
   */
  async refresh(realOrg: OrganizationId, actor: DemoActor, opts: { force?: boolean } = {}) {
    const demo = await this.resolve(realOrg);
    if (!demo) throw new DemoOrgError("A organização de demonstração ainda não foi criada.", "not_found");
    const last = this.refreshed.get(demo);
    if (!opts.force && last !== undefined && this.now() - last < REFRESH_MS) return { skipped: true, punches: 0, scenario: false };
    const inFlight = this.running.get(demo);
    // Uma de cada vez; uma atualização presa há mais de 10 min não bloqueia as seguintes.
    if (inFlight && this.now() - (this.runningSince.get(demo) ?? 0) < REFRESH_MS) return { skipped: true, running: true, punches: 0, scenario: false };
    this.refreshed.set(demo, this.now());
    const job = this.support.today(realOrg).then((today) => this.update(demo, actor, today));
    this.running.set(demo, job);
    this.runningSince.set(demo, this.now());
    job.then(
      (result) => this.lastRun.set(demo, { at: new Date(this.now()).toISOString(), result, error: null }),
      (e) => this.lastRun.set(demo, { at: new Date(this.now()).toISOString(), result: null, error: e instanceof Error ? e.message : String(e) }),
    );
    try {
      return { skipped: false, ...(await job) };
    } finally {
      if (this.running.get(demo) === job) this.running.delete(demo);
    }
  }

  private async update(demo: OrganizationId, actor: DemoActor, today: string) {
    const dataset = generateDemoDataset({ seed: SEED, employeesPerCenter: this.perCenter, from: today, to: today });
    let rows = await this.live.employees(demo);
    // A demo cresceu (mais colaboradores no gerador): acrescenta só quem falta.
    const known = new Set(rows.map((r) => keyFromEmail(r.email)));
    const missing = dataset.employees.filter((e) => !known.has(e.key));
    let added = 0;
    if (missing.length) {
      added = await this.live.addEmployees(
        demo,
        missing,
        dataset.schedules.map((x) => ({ key: x.key, name: x.name })),
        dataset.centers.map((c) => ({ key: c.key, name: c.name })),
        dataset.positions.map((p) => ({ key: p.key, name: p.name })),
        actor.email,
        Number(today.slice(0, 4)),
      );
      rows = await this.live.employees(demo);
    }
    const byKey = new Map(rows.map((r) => [keyFromEmail(r.email), r]));
    const scheduleName = new Map(dataset.schedules.map((s) => [s.key, s.name]));

    const noPhoto = dataset.employees.flatMap((e) => {
      const row = byKey.get(e.key);
      return row && !row.photoPath ? [{ id: row.id, photoPath: e.photoPath }] : [];
    });
    if (noPhoto.length) await this.live.setPhotos(demo, noPhoto);

    let scenario = false;
    const people = dataset.employees
      .map((e) => ({ e, row: byKey.get(e.key) }))
      .filter((x) => x.row)
      .map(({ e, row }) => ({ id: row!.id, key: e.key, locationId: row!.locationId, scheduleName: scheduleName.get(e.scheduleKey)! }));
    if (!(await this.scenario.hasScenario(demo))) {
      await this.live.ensureVacationType(demo, actor.email);
      const schedules = dataset.schedules.filter((s, i, a) => a.findIndex((x) => x.name === s.name) === i);
      await this.scenario.build(demo, actor, planScenario(people, schedules, today));
      scenario = true;
    }

    // Em dia com o calendário (antes das marcações: quem está de férias hoje não pica).
    const schedulesByName = dataset.schedules.filter((x, i, a) => a.findIndex((y) => y.name === x.name) === i);
    const current = await this.scenario.keepCurrent(demo, actor, planCurrent(people, schedulesByName, today));

    const t = DateTime.fromISO(today, { zone: "utc" });
    const window = t.minus({ days: WINDOW_DAYS });
    const prevMonth = t.minus({ months: 1 }).startOf("month");
    const from = (prevMonth < window ? prevMonth : window).toISODate()!;
    const nowUtc = new Date(this.now()).toISOString();
    const punches = generatePunches({ seed: SEED, employees: dataset.employees, schedules: dataset.schedules, from, to: today, nowUtc, lateBoostDate: today });
    const [existing, absences] = await Promise.all([this.live.existingEventIds(demo, `${DateTime.fromISO(from, { zone: "utc" }).minus({ days: 1 }).toISODate()}T00:00:00.000Z`), this.live.absenceDays(demo, from, today)]);
    const absent = (employeeId: string, date: string) => absences.some((a) => a.employeeId === employeeId && a.startDate <= date && a.endDate >= date);
    const toInsert = [];
    for (const p of punches) {
      const row = byKey.get(p.employeeKey);
      if (!row || existing.has(p.clientEventId) || absent(row.id, p.workDate)) continue;
      toInsert.push({ employeeId: row.id, occurredAt: p.atUtc, segmentType: PUNCH_SEGMENT[p.kind], clientEventId: p.clientEventId, locationId: row.locationId });
    }
    const inserted = toInsert.length ? await this.live.insertPunches(demo, toInsert) : 0;

    // Enriquecimento para apresentações (só o que falta): aniversários, alertas, mais pedidos, mês anterior fechado.
    const plan = planEnrichment(people, today);
    const noBirth = plan.birthDates.filter((b) => !rows.find((r) => r.id === b.employeeId)?.birthDate);
    if (noBirth.length) await this.live.setBirthDates(demo, noBirth.map((b) => ({ id: b.employeeId, birthDate: b.birthDate })));
    const enriched = await this.scenario.enrich(demo, actor, plan);
    return { punches: inserted, scenario, enriched, added, current };
  }
}
