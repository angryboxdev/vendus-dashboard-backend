import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { DashboardCachePort, DashboardMetric } from "../../domain/ports/out/dashboard.ports.js";

/** Versão do formato dos agregados (mudar invalida tudo o que estava em cache). */
const SCHEMA_VERSION = 1;
const MAX_ENTRIES = 2000;

/**
 * Cache em memória do processo (não há Redis no projeto). Chave:
 * `dashboard:tenant:{org}:context:{ctx}:date:{d}:metric:{m}:v:{n}:viewer:{u}` —
 * nunca uma chave genérica; organizações, contextos e âmbitos não se misturam.
 * Pedidos simultâneos para a mesma chave partilham a mesma carga.
 */
export class MemoryDashboardCache implements DashboardCachePort {
  private readonly entries = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  static keyOf(k: { org: OrganizationId; metric: DashboardMetric; date: string; viewer: string; context: string }): string {
    return `dashboard:tenant:${k.org}:context:${k.context}:date:${k.date}:metric:${k.metric}:v:${SCHEMA_VERSION}:viewer:${k.viewer}`;
  }

  async getOrLoad<T>(key: { org: OrganizationId; metric: DashboardMetric; date: string; viewer: string; context: string }, ttlMs: number, load: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    const k = MemoryDashboardCache.keyOf(key);
    const cur = this.entries.get(k);
    if (cur && this.now() - cur.at < cur.ttl) return { value: (await cur.value) as T, hit: true };
    if (this.entries.size >= MAX_ENTRIES) this.evict();
    const value = load();
    this.entries.set(k, { at: this.now(), ttl: ttlMs, value });
    // Falhas não ficam em cache.
    value.catch(() => this.entries.delete(k));
    return { value: await value, hit: false };
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
