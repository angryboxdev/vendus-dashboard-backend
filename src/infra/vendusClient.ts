import { ENV } from "../config/env.js";

/**
 * The Vendus API key, resolved from the database at server boot (ticket 03,
 * org-integration-credentials) instead of `VENDUS_API_KEY`. Module-level
 * singleton, not per-request: this repo has exactly one organization/
 * location today (spec.md Scope Boundary), and every legacy caller of this
 * file (`vendusProductsCatalog.ts`, `documentsRoutes.ts`, etc.) keeps calling
 * `vendusGet`/etc. exactly as before, transparently picking up the
 * DB-sourced key — rewriting each of them for real per-request
 * multi-tenancy is out of scope for this ticket. `setVendusApiKey` must be
 * called once, early in `src/server.ts`, before any route is mounted.
 */
let vendusApiKey: string | undefined;

export function setVendusApiKey(key: string): void {
  vendusApiKey = key;
}

function getApiKey(): string {
  if (!vendusApiKey) {
    throw new Error("Vendus API key not set — call setVendusApiKey() before making Vendus API calls.");
  }
  return vendusApiKey;
}

/**
 * Vendus GET helper
 * Mantém api_key na query como hoje.
 * Se futuramente mudar pra Basic Auth, altera só aqui.
 */
export async function vendusGet<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const urlObj = new URL(`${ENV.BASE_URL}${path}`);
  urlObj.searchParams.set("api_key", getApiKey());
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      urlObj.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(urlObj.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vendus error ${res.status}: ${text}`);
  }

  return res.json() as T;
}

export async function vendusPatch<T = void>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const urlObj = new URL(`${ENV.BASE_URL}${path}`);
  urlObj.searchParams.set("api_key", getApiKey());

  const res = await fetch(urlObj.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vendus error ${res.status}: ${text}`);
  }

  const contentLength = res.headers.get("content-length");
  if (res.status === 204 || contentLength === "0") return undefined as T;

  return res.json() as T;
}

/**
 * PUT/PATCH com **HTTP Basic Auth** — mesmo padrão dos endpoints de escrita do Vendus.
 */
export async function vendusBasicWrite<T = void>(
  method: "PUT" | "PATCH",
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const urlObj = new URL(`${ENV.BASE_URL}${path}`);
  const basic = Buffer.from(`${getApiKey()}:`, "utf8").toString("base64");

  const res = await fetch(urlObj.toString(), {
    method,
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vendus error ${res.status}: ${text}`);
  }

  const contentLength = res.headers.get("content-length");
  if (res.status === 204 || contentLength === "0") return undefined as T;

  return res.json() as T;
}

/**
 * GET com **HTTP Basic Auth** conforme exemplos PHP da Vendus (`CURLOPT_USERPWD` = só a API key):
 * username = API key, password vazio → credencial `apiKey:` em Base64.
 * Não confundir com `:apiKey` (isso dá 401 A001 nos endpoints selfconsumption, etc.).
 */
export async function vendusGetBasic<T>(
  path: string,
  query?: Record<string, string | number | undefined>
): Promise<T> {
  const urlObj = new URL(`${ENV.BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === "") continue;
      urlObj.searchParams.set(k, String(v));
    }
  }

  const basic = Buffer.from(`${getApiKey()}:`, "utf8").toString("base64");

  const res = await fetch(urlObj.toString(), {
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vendus error ${res.status}: ${text}`);
  }

  return res.json() as T;
}
