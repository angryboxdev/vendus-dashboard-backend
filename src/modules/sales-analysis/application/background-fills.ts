import type { OrganizationId } from "../../../kernel/organization-id.js";
import type { AirMenuMonthStatus, DateRange, FillProgress, IsoDate, SalesBucket } from "../domain/entities/sales-analysis.js";
import type { AirMenuSalesSourcePort, ClockPort, SalesBucketStorePort, VendusSalesSourcePort } from "../domain/ports/out/sales-analysis.ports.js";
import { addDays, eachDay, intersect, monthRange, toContiguousRanges } from "../domain/services/dates.js";

/**
 * Preenchimento da Vendus em segundo plano: pede os dias fechados em falta,
 * aos blocos de até 7 dias, e guarda-os. Um só trabalho por organização; dias
 * pedidos enquanto corre juntam-se à fila. Vive em memória (um deploy recomeça
 * do que falta — o que já foi guardado não se perde).
 */
export class VendusFillCoordinator {
  private readonly jobs = new Map<string, { queue: Set<IsoDate>; progress: FillProgress }>();

  constructor(
    private readonly vendus: VendusSalesSourcePort,
    private readonly store: SalesBucketStorePort,
    private readonly chunkDays = 7,
  ) {}

  progress(org: OrganizationId): FillProgress | null {
    const j = this.jobs.get(org);
    return j ? { ...j.progress } : null;
  }

  /** Garante que os dias são preenchidos. Devolve o progresso atual. */
  ensure(org: OrganizationId, days: IsoDate[]): FillProgress | null {
    if (days.length === 0) return this.progress(org);
    const existing = this.jobs.get(org);
    if (existing?.progress.running) {
      let added = 0;
      for (const d of days) if (!existing.queue.has(d)) { existing.queue.add(d); added++; }
      existing.progress.totalDays += added;
      return { ...existing.progress };
    }
    const job = { queue: new Set(days), progress: { running: true, doneDays: 0, totalDays: days.length } as FillProgress };
    this.jobs.set(org, job);
    void this.run(org, job);
    return { ...job.progress };
  }

  /** Espera pelo fim do trabalho atual (para testes). */
  async idle(org: OrganizationId): Promise<void> {
    while (this.jobs.get(org)?.progress.running) await new Promise((r) => setTimeout(r, 5));
  }

  private async run(org: OrganizationId, job: { queue: Set<IsoDate>; progress: FillProgress }) {
    try {
      while (job.queue.size > 0) {
        const pending = [...job.queue].sort();
        const [range] = toContiguousRanges(pending, this.chunkDays);
        if (!range) break;
        const days = eachDay(range).filter((d) => job.queue.has(d));
        try {
          const buckets = await this.vendus.fetchBuckets(range);
          await this.store.saveDays(org, "vendus", days, buckets);
        } catch (e) {
          job.progress.lastError = e instanceof Error ? e.message : String(e);
          console.error("[sales-analysis] Vendus fill failed for", range, e);
          // Não insiste nos mesmos dias neste trabalho: ficam em falta e são pedidos no próximo acesso.
        }
        for (const d of days) job.queue.delete(d);
        job.progress.doneDays += days.length;
      }
    } finally {
      job.progress.running = false;
    }
  }
}

/**
 * Pedidos à AirMenu — sempre a pedido do utilizador e sempre aos poucos:
 * - **fila única** para todo o servidor: um mês de cada vez, mesmo que o
 *   utilizador clique «Buscar» em vários meses (os outros ficam «na fila»);
 * - cada mês é pedido **uma semana de cada vez**, com uma pausa entre semanas,
 *   e cada semana é guardada logo — se algo falhar a meio, o que já veio fica;
 * - só os dias ainda não guardados (mais hoje, que nunca se guarda) são pedidos.
 * O ritmo dos pedidos individuais (2 a cada 2 s) é do gateway da AirMenu.
 */
export class AirMenuFetchCoordinator {
  private readonly state = new Map<string, AirMenuMonthStatus>();
  private readonly today = new Map<string, { date: IsoDate; buckets: SalesBucket[] }>();
  private readonly queue: { org: OrganizationId; label: string; key: string; range: DateRange | null }[] = [];
  private running = false;

  constructor(
    private readonly airMenu: AirMenuSalesSourcePort,
    private readonly store: SalesBucketStorePort,
    private readonly clock: ClockPort,
    private readonly chunkDays = 7,
    private readonly pauseMs = 15_000,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  status(org: OrganizationId, month: string): AirMenuMonthStatus | null {
    const s = this.state.get(`${org}|${month}`);
    return s ? { ...s } : null;
  }

  todayBuckets(org: OrganizationId): SalesBucket[] {
    const t = this.today.get(org);
    return t && t.date === this.clock.today() ? t.buckets : [];
  }

  start(org: OrganizationId, month: string): AirMenuMonthStatus {
    const key = `${org}|${month}`;
    const cur = this.state.get(key);
    if (cur?.state === "fetching" || cur?.state === "queued") return { ...cur };
    const s: AirMenuMonthStatus = { month, state: "queued" };
    this.state.set(key, s);
    this.queue.push({ org, label: month, key, range: intersect(monthRange(month), { from: "2000-01-01", to: this.clock.today() }) });
    void this.pump();
    return { ...s };
  }

  /** Busca só um dia fechado (usado pela busca diária automática). Entra na mesma fila. */
  startDay(org: OrganizationId, date: IsoDate): void {
    const key = `${org}|day|${date}`;
    const cur = this.state.get(key);
    if (cur?.state === "fetching" || cur?.state === "queued") return;
    this.state.set(key, { month: date.slice(0, 7), state: "queued" });
    this.queue.push({ org, label: date, key, range: { from: date, to: date } });
    void this.pump();
  }

  /** Espera até a fila ficar vazia (para testes). */
  async drained(): Promise<void> {
    while (this.running || this.queue.length > 0) await new Promise((r) => setTimeout(r, 5));
  }

  async idle(org: OrganizationId, month: string): Promise<void> {
    const busy = () => ["fetching", "queued"].includes(this.state.get(`${org}|${month}`)?.state ?? "");
    while (busy()) await new Promise((r) => setTimeout(r, 5));
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      for (let job = this.queue.shift(); job; job = this.queue.shift()) await this.run(job.org, job.label, job.key, job.range);
    } finally {
      this.running = false;
    }
  }

  private async run(org: OrganizationId, label: string, key: string, range: DateRange | null) {
    const today = this.clock.today();
    const month = label.slice(0, 7);
    try {
      if (!range) throw new Error("Mês no futuro.");
      const covered = await this.store.coveredDays(org, "airmenu", range);
      const wanted = eachDay(range).filter((d) => d === today || !covered.has(d));
      const status: AirMenuMonthStatus = { month, state: "fetching", doneDays: 0, totalDays: wanted.length };
      this.state.set(key, status);
      const parts = toContiguousRanges(wanted, this.chunkDays);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (i > 0 && this.pauseMs > 0) await this.sleep(this.pauseMs);
        const buckets = await this.airMenu.fetchBuckets(part);
        const closedDays = eachDay(part).filter((d) => d < today);
        if (closedDays.length) await this.store.saveDays(org, "airmenu", closedDays, buckets.filter((b) => b.date < today));
        if (part.to === today) this.today.set(org, { date: today, buckets: buckets.filter((b) => b.date === today) });
        status.doneDays = (status.doneDays ?? 0) + eachDay(part).length;
      }
      this.state.delete(key);
    } catch (e) {
      console.error("[sales-analysis] AirMenu fetch failed for", label, e);
      this.state.set(key, { month, state: "error", error: "A AirMenu não respondeu. O que já veio ficou guardado; tente de novo mais tarde para buscar o resto." });
    }
  }
}

/**
 * Busca diária automática da AirMenu (decisão da gerência, 2026-11-21): todos
 * os dias, a partir da hora indicada (Lisboa), se o dia anterior ainda não
 * estiver guardado, entra na fila da AirMenu (mesmo limitador e mesma sessão
 * do servidor). `tick()` é chamado periodicamente pelo composition root.
 */
export class DailyAirMenuSync {
  private lastRunFor: IsoDate | null = null;

  constructor(
    private readonly jobs: AirMenuFetchCoordinator,
    private readonly store: SalesBucketStorePort,
    private readonly clock: ClockPort,
    private readonly organizationId: OrganizationId,
    private readonly fromHour = 5,
  ) {}

  async tick(): Promise<IsoDate | null> {
    const today = this.clock.today();
    if (this.lastRunFor === today || this.clock.hour() < this.fromHour) return null;
    this.lastRunFor = today;
    const yesterday = addDays(today, -1);
    try {
      const covered = await this.store.coveredDays(this.organizationId, "airmenu", { from: yesterday, to: yesterday });
      if (covered.has(yesterday)) return null;
      this.jobs.startDay(this.organizationId, yesterday);
      return yesterday;
    } catch (e) {
      this.lastRunFor = null; // tenta de novo no próximo tick
      console.error("[sales-analysis] daily AirMenu sync failed:", e);
      return null;
    }
  }
}
