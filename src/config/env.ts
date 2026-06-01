import dotenv from "dotenv";
dotenv.config();

function must<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing env var: ${name}`);
  }
  return value as T;
}

export const ENV = {
  BASE_URL: must(process.env.VENDUS_BASE_URL, "VENDUS_BASE_URL"),
  API_KEY: must(process.env.VENDUS_API_KEY, "VENDUS_API_KEY"),
  PORT: Number(process.env.PORT || 3333),

  PER_PAGE_DEFAULT: Number(process.env.VENDUS_PER_PAGE || 50),
  CONCURRENCY: Number(process.env.VENDUS_CONCURRENCY || 6),
  /**
   * Máximo de GET /selfconsumption/{id}/ por pedido (listagem vem muitas vezes sem `products`).
   * IDs únicos acima disto ficam sem enriquecer; vê `details_fetch_truncated` na resposta.
   */
  SELFCONSUMPTION_MAX_DETAIL_FETCHES: Number(
    process.env.VENDUS_SELFCONSUMPTION_MAX_DETAIL_FETCHES || 800
  ),

  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  /** Service role: necessário para o módulo RH (tabelas com RLS sem policies anon). */
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  /** Se true, agenda job de consumo diário no próprio processo do servidor (ver DAILY_CONSUMPTION_CRON_SCHEDULE). */
  ENABLE_DAILY_CONSUMPTION_CRON:
    process.env.ENABLE_DAILY_CONSUMPTION_CRON === "true",
  /** Expressão cron (5 campos), timezone Europe/Lisbon. Por omissão: 01:30 — debita o dia civil anterior. */
  DAILY_CONSUMPTION_CRON_SCHEDULE:
    process.env.DAILY_CONSUMPTION_CRON_SCHEDULE ?? "30 1 * * *",

  /**
   * Segredo para POST /api/internal/cron/daily-vendus-consumption (Bearer).
   * Se vazio, a rota não é registada.
   */
  CRON_SECRET: process.env.CRON_SECRET ?? "",

  /** OpenAI: importação de faturas de fornecedor (extração estruturada). */
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_MODEL_TEXT: process.env.OPENAI_MODEL_TEXT ?? "gpt-4o-mini",
  OPENAI_MODEL_VISION: process.env.OPENAI_MODEL_VISION ?? "gpt-4o",

  /**
   * Segredo HMAC para o kiosk de ponto (QR diário + hash do PIN).
   * Se vazio, os endpoints de kiosk retornam 503.
   */
  HR_KIOSK_HMAC_SECRET: process.env.HR_KIOSK_HMAC_SECRET ?? "",

  /** JWT secret legado (HS256). Já não obrigatório — verificação usa JWKS. */
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET ?? "",

  /**
   * Ano a partir do qual se calcula o histórico total de faturação.
   * Default: 2021.
   */
  ANALYTICS_HISTORY_START_YEAR: Number(process.env.ANALYTICS_HISTORY_START_YEAR ?? 2025),

  // ─── Uber Eats Integration ──────────────────────────────────────────────────
  /** OAuth2 client_id da app Uber Developer Portal */
  UBER_EATS_CLIENT_ID: process.env.UBER_EATS_CLIENT_ID ?? "",
  /** OAuth2 client_secret da app Uber Developer Portal */
  UBER_EATS_CLIENT_SECRET: process.env.UBER_EATS_CLIENT_SECRET ?? "",
  /**
   * Signing secret do webhook (Uber Eats → App Settings → Webhook → Signing Key).
   * Usado para verificar X-Uber-Signature. Se vazio, verificação desativada (dev only).
   */
  UBER_EATS_WEBHOOK_CLIENT_SECRET: process.env.UBER_EATS_WEBHOOK_CLIENT_SECRET ?? "",
  /** UUID da loja Uber Eats (visível no Uber Eats Manager → URL da loja) */
  UBER_EATS_STORE_UUID: process.env.UBER_EATS_STORE_UUID ?? "",
  /**
   * register_id Vendus onde as FT Uber Eats são criadas.
   * Ver Vendus → Configurações → Registos.
   */
  UBER_EATS_VENDUS_REGISTER_ID: Number(process.env.UBER_EATS_VENDUS_REGISTER_ID ?? 0),
  /**
   * store_id Vendus.
   * Ver Vendus → Configurações → Lojas.
   */
  UBER_EATS_VENDUS_STORE_ID: Number(process.env.UBER_EATS_VENDUS_STORE_ID ?? 0),
};
