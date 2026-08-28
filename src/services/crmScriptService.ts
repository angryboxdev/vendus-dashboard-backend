import { getSupabaseServiceRole } from "../infra/scoped-db/supabase-client.js";
import type { CrmScript, CrmScriptVariant } from "../domain/crmTypes.js";

function getDb() {
  const db = getSupabaseServiceRole();
  if (!db) throw new Error("Supabase não configurado");
  return db;
}

type Row = {
  code: string;
  name: string;
  segment: string | null;
  body: string;
  variants: unknown | null;
  channel: string | null;
  trigger_timing: string | null;
  one_shot: boolean;
  cooldown_days: number | null;
  active: boolean;
};

function rowToScript(row: Row): CrmScript {
  let variants: CrmScriptVariant[] | null = null;
  if (row.variants && Array.isArray(row.variants)) {
    variants = row.variants as CrmScriptVariant[];
  }
  return {
    code: row.code,
    name: row.name,
    segment: row.segment,
    body: row.body,
    variants,
    channel: row.channel,
    triggerTiming: row.trigger_timing,
    oneShot: row.one_shot,
    cooldownDays: row.cooldown_days,
    active: row.active,
  };
}

const SELECT =
  "code, name, segment, body, variants, channel, trigger_timing, one_shot, cooldown_days, active";

/** Lista todos os scripts (activos por defeito) */
export async function listScripts(includeInactive = false): Promise<CrmScript[]> {
  const db = getDb();
  let q = db.from("crm_scripts").select(SELECT).order("code");
  if (!includeInactive) q = q.eq("active", true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data as Row[]) ?? []).map(rowToScript);
}

/** Detalhe de um script por código */
export async function getScript(code: string): Promise<CrmScript | null> {
  const db = getDb();
  const { data, error } = await db
    .from("crm_scripts")
    .select(SELECT)
    .eq("code", code)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToScript(data as Row);
}

/** Actualiza o texto ou configuração de um script */
export async function updateScript(
  code: string,
  patch: Partial<Pick<CrmScript, "body" | "name" | "active" | "channel" | "triggerTiming" | "oneShot" | "cooldownDays" | "variants">>
): Promise<CrmScript | null> {
  const db = getDb();
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.body            !== undefined) dbPatch.body           = patch.body;
  if (patch.name            !== undefined) dbPatch.name           = patch.name;
  if (patch.active          !== undefined) dbPatch.active         = patch.active;
  if (patch.channel         !== undefined) dbPatch.channel        = patch.channel;
  if (patch.triggerTiming   !== undefined) dbPatch.trigger_timing = patch.triggerTiming;
  if (patch.oneShot         !== undefined) dbPatch.one_shot       = patch.oneShot;
  if (patch.cooldownDays    !== undefined) dbPatch.cooldown_days  = patch.cooldownDays;
  if (patch.variants        !== undefined) dbPatch.variants       = patch.variants;

  const { data, error } = await db
    .from("crm_scripts")
    .update(dbPatch)
    .eq("code", code)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return rowToScript(data as Row);
}

/**
 * Renderiza o texto de um script substituindo as variáveis pelos valores reais.
 * [Nome] → nome do cliente, [Código] → código de oferta, etc.
 */
export function renderScriptBody(
  body: string,
  vars: {
    nome?: string;
    item?: string;
    codigo?: string;
    data?: string;
    nomeIndicador?: string;
    nomeIndicado?: string;
    link?: string;
  }
): string {
  let text = body;
  if (vars.nome)          text = text.replace(/\[Nome\]/g, vars.nome);
  if (vars.item)          text = text.replace(/\[Item\]/g, vars.item).replace(/\[nome do item\]/g, vars.item).replace(/\[item habitual\]/g, vars.item);
  if (vars.codigo)        text = text.replace(/\[Código\]/g, vars.codigo).replace(/\[CODIGO\]/g, vars.codigo);
  if (vars.data)          text = text.replace(/\[Data\]/g, vars.data).replace(/\[data\]/g, vars.data);
  if (vars.nomeIndicador) text = text.replace(/\[Nome do indicador\]/g, vars.nomeIndicador);
  if (vars.nomeIndicado)  text = text.replace(/\[Nome do indicado\]/g, vars.nomeIndicado);
  if (vars.link)          text = text.replace(/\[LINK\]/g, vars.link);
  return text;
}
