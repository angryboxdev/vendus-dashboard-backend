import { ENV } from "../config/env.js";

/**
 * Vendus GET helper
 * Mantém api_key na query como hoje.
 * Se futuramente mudar pra Basic Auth, altera só aqui.
 */
export async function vendusGet<T>(path: string): Promise<T> {
  const url = new URL(`${ENV.BASE_URL}${path}`);
  url.searchParams.set("api_key", ENV.API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vendus error ${res.status}: ${text}`);
  }

  return res.json() as T;
}
