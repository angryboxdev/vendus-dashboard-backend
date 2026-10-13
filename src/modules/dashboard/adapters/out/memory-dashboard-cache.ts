import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DashboardCachePort, DashboardMetric } from "../../domain/ports/out/dashboard.ports.js";

/** Versão do formato dos agregados (mudar invalida tudo o que estava em cache). */
const SCHEMA_VERSION = 1;
const MAX_ENTRIES = 2000;
/** Depois do TTL, o último valor ainda serve até isto (e atualiza em segundo plano). */
const STALE_MAX_MS = 10 * 60_000;

/**
 * Cache em memória do processo (não há Redis no projeto). Chave:
 * `dashboard:tenant:{org}:context:{ctx}:date:{d}:metric:{m}:v:{n}:viewer:{u}` —
 * nunca uma chave genérica; organizações, contextos e âmbitos não se misturam.
 * Pedidos simultâneos para a mesma chave partilham a mesma carga.
 */
export class MemoryDashboardCache implements DashboardCachePort {
  private readonly entries = new Map<string, { at: number; ttl: number; value: Promise<unknown>; settled?: boolean; refreshing?: boolean }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  static keyOf(k: { org: OrganizationId; metric: DashboardMetric; date: string; viewer: string; context: string }): string {
    return `dashboard:tenant:${k.org}:context:${k.context}:date:${k.date}:metric:${k.metric}:v:${SCHEMA_VERSION}:viewer:${k.viewer}`;
  }

  async getOrLoad<T>(key: { org: OrganizationId; metric: DashboardMetric; date: string; viewer: string; context: string }, ttlMs: number, load: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    const k = MemoryDashboardCache.keyOf(key);
    const cur = this.entries.get(k);
    const age = cur ? this.now() - cur.at : Infinity;
    if (cur && age < cur.ttl) return { value: (await cur.value) as T, hit: true };
    // Stale-while-revalidate: só para apresentação (nunca base de escrita); invalidações apagam a entrada.
    if (cur && cur.settled && age < STALE_MAX_MS) {
      if (!cur.refreshing) {
        cur.refreshing = true;
        const next = this.start(k, ttlMs, load, false);
        next.value.then(() => this.entries.set(k, next)).catch(() => void (cur.refreshing = false));
      }
      return { value: (await cur.value) as T, hit: true };
    }
    if (this.entries.size >= MAX_ENTRIES) this.evict();
    const entry = this.start(k, ttlMs, load, true);
    return { value: (await entry.value) as T, hit: false };
  }

  private start(k: string, ttl: number, load: () => Promise<unknown>, register: boolean) {
    const entry: { at: number; ttl: number; value: Promise<unknown>; settled?: boolean; refreshing?: boolean } = { at: this.now(), ttl, value: load() };
    if (register) this.entries.set(k, entry);
    // Falhas não ficam em cache.
    entry.value.then(
      () => (entry.settled = true),
      () => (this.entries.get(k) === entry ? this.entries.delete(k) : undefined),
    );
    return entry;
  }

  /** Invalidação seletiva: só as métricas afetadas desta organização. */
  invalidate(org: OrganizationId, metrics: DashboardMetric[]): void {
    const prefix = `dashboard:tenant:${org}:`;
    for (const k of [...this.entries.keys()]) if (k.startsWith(prefix) && metrics.some((m) => k.includes(`:metric:${m}:`))) this.entries.delete(k);
  }

  private evict(): void {
    const t = this.now();
    for (const [k, e] of this.entries) if (t - e.at >= e.ttl) this.entries.delete(k);
    // Ainda cheio: sai o mais antigo.
    while (this.entries.size >= MAX_ENTRIES) {
      const first = this.entries.keys().next().value;
      if (first === undefined) break;
      this.entries.delete(first);
    }
  }
}
