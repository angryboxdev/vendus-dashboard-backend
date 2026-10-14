import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Memo por pedido HTTP das leituras ao PostgREST (perf da Visão geral).
 *
 * Num GET, o mesmo SELECT repete-se muitas vezes (ex.: estrutura e
 * configurações de cada colaborador relidas por dia). Dentro de um contexto
 * (`runWithRequestMemo`) cada leitura idêntica — mesmo URL e mesmos
 * cabeçalhos — vai uma vez à base; as seguintes reutilizam a resposta.
 *
 * Correção: só leituras (GET/HEAD) a `/rest/v1/<tabela>`; qualquer escrita a
 * uma tabela apaga o memo dessa tabela; erros não ficam guardados; cada
 * entrada vale no máximo `MEMO_MAX_AGE_MS` (trabalho em segundo plano que
 * continua depois da resposta não usa dados velhos). Sem contexto, o fetch é
 * o normal — nada muda fora dos pedidos que o ativam.
 */
export const MEMO_MAX_AGE_MS = 30_000;

interface Stored {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
}
interface Ctx {
  entries: Map<string, { table: string; at: number; value: Promise<Stored> }>;
  hits: number;
  misses: number;
}

const als = new AsyncLocalStorage<Ctx>();

export function runWithRequestMemo<T>(fn: () => T): T {
  return als.run({ entries: new Map(), hits: 0, misses: 0 }, fn);
}

/** Acertos/falhas do memo no pedido atual (null fora de um contexto). */
export function requestMemoStats(): { hits: number; misses: number } | null {
  const c = als.getStore();
  return c ? { hits: c.hits, misses: c.misses } : null;
}

const toResponse = (s: Stored) => new Response(s.status === 204 ? null : s.body, { status: s.status, statusText: s.statusText, headers: s.headers });

export function memoizingFetch(base: typeof fetch = fetch, now: () => number = () => Date.now()): typeof fetch {
  return async (input, init) => {
    const ctx = als.getStore();
    const request = input instanceof Request ? input : null;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const table = /\/rest\/v1\/([^/?#]+)/.exec(url)?.[1];
    if (!ctx || !table || table === "rpc") return base(input, init);
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      for (const [k, e] of ctx.entries) if (e.table === table) ctx.entries.delete(k);
      return base(input, init);
    }
    const headers = [...new Headers(init?.headers ?? request?.headers)].sort(([a], [b]) => a.localeCompare(b));
    const key = `${method} ${url} ${JSON.stringify(headers)}`;
    const hit = ctx.entries.get(key);
    if (hit && now() - hit.at < MEMO_MAX_AGE_MS) {
      ctx.hits++;
      return toResponse(await hit.value);
    }
    ctx.misses++;
    const value = base(input, init).then(async (r) => ({ status: r.status, statusText: r.statusText, headers: [...r.headers], body: await r.text() }));
    const entry = { table, at: now(), value };
    ctx.entries.set(key, entry);
    const stored = await value.catch((e: unknown) => {
      if (ctx.entries.get(key) === entry) ctx.entries.delete(key);
      throw e;
    });
    if (stored.status >= 400 && ctx.entries.get(key) === entry) ctx.entries.delete(key);
    return toResponse(stored);
  };
}
