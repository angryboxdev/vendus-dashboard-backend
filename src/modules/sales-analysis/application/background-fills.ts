import type { OrganizationId } from "../../../kernel/organization-id.js";
import type { AirMenuMonthStatus, FillProgress, IsoDate, SalesBucket } from "../domain/entities/sales-analysis.js";
import type { AirMenuSalesSourcePort, ClockPort, SalesBucketStorePort, VendusSalesSourcePort } from "../domain/ports/out/sales-analysis.ports.js";
import { eachDay, intersect, monthRange, toContiguousRanges } from "../domain/services/dates.js";

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
 * Pedidos à AirMenu: um mês de cada vez, sempre a pedido do utilizador.
 * Guarda os dias fechados do mês; o dia de hoje fica só em memória.
 */
export class AirMenuFetchCoordinator {
  private readonly state = new Map<string, AirMenuMonthStatus>();
  private readonly today = new Map<string, { date: IsoDate; buckets: SalesBucket[] }>();

  constructor(
    private readonly airMenu: AirMenuSalesSourcePort,
    private readonly store: SalesBucketStorePort,
    private readonly clock: ClockPort,
  ) {}

  status(org: OrganizationId, month: string): AirMenuMonthStatus | null {
    return this.state.get(`${org}|${month}`) ?? null;
  }

  todayBuckets(org: OrganizationId): SalesBucket[] {
    const t = this.today.get(org);
    return t && t.date === this.clock.today() ? t.buckets : [];
  }

  start(org: OrganizationId, month: string): AirMenuMonthStatus {
    const key = `${org}|${month}`;
    const cur = this.state.get(key);
    if (cur?.state === "fetching") return cur;
    const s: AirMenuMonthStatus = { month, state: "fetching" };
    this.state.set(key, s);
    void this.run(org, month, key);
    return s;
  }

  async idle(org: OrganizationId, month: string): Promise<void> {
    while (this.state.get(`${org}|${month}`)?.state === "fetching") await new Promise((r) => setTimeout(r, 5));
  }

  /**
   * Só pede à API os dias que ainda não estão guardados (e o dia de hoje, que
   * nunca fica guardado). Dias anteriores já guardados nunca voltam a ser pedidos.
   */
  private async run(org: OrganizationId, month: string, key: string) {
    const today = this.clock.today();
    const range = intersect(monthRange(month), { from: "2000-01-01", to: today });
    try {
      if (!range) throw new Error("Mês no futuro.");
      const covered = await this.store.coveredDays(org, "airmenu", range);
      const wanted = eachDay(range).filter((d) => d === today || !covered.has(d));
      for (const part of toContiguousRanges(wanted, 31)) {
        const buckets = await this.airMenu.fetchBuckets(part);
        const closedDays = eachDay(part).filter((d) => d < today);
        if (closedDays.length) await this.store.saveDays(org, "airmenu", closedDays, buckets.filter((b) => b.date < today));
        if (part.to === today) this.today.set(org, { date: today, buckets: buckets.filter((b) => b.date === today) });
      }
      this.state.delete(key);
    } catch (e) {
      console.error("[sales-analysis] AirMenu fetch failed for", month, e);
      this.state.set(key, { month, state: "error", error: "A AirMenu não respondeu. Tente novamente mais tarde." });
    }
  }
}
