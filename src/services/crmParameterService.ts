import { getSupabaseServiceRole } from "../infra/scoped-db/supabase-client.js";
import type { CrmParameter, CrmParams } from "../domain/crmTypes.js";

// Cache simples em memória — expira após 60 segundos
let cache: { params: CrmParams; expiresAt: number } | null = null;

function getDb() {
  const db = getSupabaseServiceRole();
  if (!db) throw new Error("Supabase não configurado");
  return db;
}

/** Converte array de CrmParameter para CrmParams tipado */
function rowsToParams(rows: CrmParameter[]): CrmParams {
  const get = (key: string, fallback: number): number => {
    const row = rows.find((r) => r.key === key);
    if (!row) return fallback;
    const n = parseFloat(row.value);
    return isNaN(n) ? fallback : n;
  };

  return {
    seg01MaxDays:       get("seg01_max_days", 14),
    seg02MaxDays:       get("seg02_max_days", 30),
    seg03MaxDays:       get("seg03_max_days", 30),
    seg04MaxDays:       get("seg04_max_days", 45),
    seg05MaxDays:       get("seg05_max_days", 60),
    vipMinOrders:       get("vip_min_orders", 4),
    vipMinLtv:          get("vip_min_ltv", 100),
    seg01Days212:       get("seg01_days_2_1_2", 3),
    seg01Days213:       get("seg01_days_2_1_3", 10),
    seg01DaysTransition:get("seg01_days_transition", 15),
    seg02Days221:       get("seg02_days_2_2_1", 18),
    seg02Days222:       get("seg02_days_2_2_2", 25),
    seg02DaysTransition:get("seg02_days_transition", 31),
    seg03CycleDays:     get("seg03_cycle_days", 21),
    seg04CheckinDays:   get("seg04_checkin_days", 60),
    seg04RiskDays:      get("seg04_risk_days", 25),
    seg05Days251:       get("seg05_days_2_5_1", 35),
    seg05Days251Vip:    get("seg05_days_2_5_1_vip", 50),
    seg05Days252Rec:    get("seg05_days_2_5_2_rec", 50),
    seg05Days252Vip:    get("seg05_days_2_5_2_vip", 58),
    seg05DaysTransition:get("seg05_days_transition", 61),
    seg06Days261:       get("seg06_days_2_6_1", 65),
    seg06SleepDays:     get("seg06_sleep_days", 79),
    seg07DaysFirst:     get("seg07_days_first", 1),
    seg07Days272:       get("seg07_days_2_7_2", 7),
    seg07InactiveDays:  get("seg07_inactive_days", 21),
  };
}

/** Carrega parâmetros da BD (com cache de 60s) */
export async function loadParams(): Promise<CrmParams> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.params;

  const db = getDb();
  const { data, error } = await db
    .from("crm_parameters")
    .select("key, value, description, category");

  if (error) throw new Error(`Erro ao carregar parâmetros CRM: ${error.message}`);

  const params = rowsToParams((data as CrmParameter[]) ?? []);
  cache = { params, expiresAt: now + 60_000 };
  return params;
}

/** Invalida o cache (usar após atualizar parâmetros) */
export function invalidateParamsCache() {
  cache = null;
}

/** Lista todos os parâmetros da BD */
export async function listParameters(): Promise<CrmParameter[]> {
  const db = getDb();
  const { data, error } = await db
    .from("crm_parameters")
    .select("key, value, description, category")
    .order("category")
    .order("key");

  if (error) throw new Error(error.message);
  return (data as CrmParameter[]) ?? [];
}

/** Atualiza o valor de um parâmetro */
export async function updateParameter(key: string, value: string): Promise<CrmParameter> {
  const db = getDb();
  const { data, error } = await db
    .from("crm_parameters")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", key)
    .select("key, value, description, category")
    .single();

  if (error) throw new Error(error.message);
  invalidateParamsCache();
  return data as CrmParameter;
}
