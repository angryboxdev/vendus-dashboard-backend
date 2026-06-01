import { ENV } from "../config/env.js";

/**
 * Vendus GET helper
 * Mantém api_key na query como hoje.
 * Se futuramente mudar pra Basic Auth, altera só aqui.
 */
export async function vendusGet<T>(path: string): Promise<T> {
  const url = `${ENV.BASE_URL}${path}`;
  const urlObj = new URL(url);
  urlObj.searchParams.set("api_key", ENV.API_KEY);

  const res = await fetch(urlObj.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vendus error ${res.status}: ${text}`);
  }

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

  const basic = Buffer.from(`${ENV.API_KEY}:`, "utf8").toString("base64");

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

/**
 * POST autenticado com HTTP Basic Auth (mesmo esquema do vendusGetBasic).
 */
export async function vendusPost<T>(path: string, body: unknown): Promise<T> {
  const urlObj = new URL(`${ENV.BASE_URL}${path}`);
  const basic = Buffer.from(`${ENV.API_KEY}:`, "utf8").toString("base64");

  const res = await fetch(urlObj.toString(), {
    method: "POST",
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

  return res.json() as T;
}
