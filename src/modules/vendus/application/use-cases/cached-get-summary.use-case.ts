import type { GetSummaryPort, SummaryParams, VendusSummaryResult } from "../../domain/ports/in/get-summary.port.js";

/** Resumos de períodos fechados guardados no máximo (cada um com os documentos do período). */
const DEFAULT_MAX_ENTRIES = 12;

/**
 * Guarda em memória o resumo de períodos já fechados (`until` antes de hoje): os documentos têm a data
 * de emissão e não mudam, e uma NC emitida hoje conta no dia de hoje — por isso o resultado de um
 * período passado não muda. Períodos que incluem hoje passam sempre à Vendus. Ao chegar ao limite
 * sai o mais antigo; um reinício (deploy) começa vazio.
 */
export class CachedGetSummaryUseCase implements GetSummaryPort {
  private readonly cache = new Map<string, Promise<VendusSummaryResult>>();

  constructor(
    private readonly inner: GetSummaryPort,
    /** Hoje, YYYY-MM-DD (injetado para os testes). */
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
    private readonly maxEntries = DEFAULT_MAX_ENTRIES,
  ) {}

  execute(params: SummaryParams): Promise<VendusSummaryResult> {
    if (params.until >= this.today()) return this.inner.execute(params);
    const key = `${params.since}|${params.until}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const request = this.inner.execute(params);
    this.cache.set(key, request);
    if (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value!);
    // Um erro não fica guardado.
    request.catch(() => this.cache.delete(key));
    return request;
  }
}
