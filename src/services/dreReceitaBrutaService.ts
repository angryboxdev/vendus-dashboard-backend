import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import type {
  ReceitaBrutaItem,
  ReceitaBrutaPayload,
  ReceitaBrutaCreateBody,
  ReceitaBrutaUpdateBody,
  DRE_CategoriaReceitaBruta,
} from "../domain/dreTypes.js";

type Row = {
  id: string;
  year: number;
  month: number;
  categoria: string;
  descricao: string;
  valor: number;
  taxa: number;
  observacao: string;
};

function rowToItem(row: Row): ReceitaBrutaItem {
  return {
    id: row.id,
    descricao: row.descricao ?? "",
    valor: Number(row.valor),
    taxa: Number(row.taxa),
    observacao: row.observacao ?? "",
  };
}

export async function getReceitaBruta(
  year: number,
  month: number
): Promise<ReceitaBrutaPayload> {
  if (!isSupabaseConfigured()) {
    return { dinheiro: [], tpa: [], apps: [] };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { dinheiro: [], tpa: [], apps: [] };
  }

  const { data, error } = await supabase
    .from("dre_receita_bruta")
    .select("id, year, month, categoria, descricao, valor, taxa, observacao")
    .eq("year", year)
    .eq("month", month)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`DRE receita bruta: ${error.message}`);
  }

  const rows = (data ?? []) as Row[];
  const dinheiro = rows.filter((r) => r.categoria === "dinheiro").map(rowToItem);
  const tpa = rows.filter((r) => r.categoria === "tpa").map(rowToItem);
  const apps = rows.filter((r) => r.categoria === "apps").map(rowToItem);

  return { dinheiro, tpa, apps };
}

function requireSupabase(): NonNullable<ReturnType<typeof getSupabase>> {
  if (!isSupabaseConfigured()) {
    throw new Error("DRE não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY");
  }
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase não disponível");
  }
  return supabase;
}

export async function createReceitaBruta(
  year: number,
  month: number,
  body: ReceitaBrutaCreateBody
): Promise<ReceitaBrutaItem> {
  const supabase = requireSupabase();
  const categoria = body.section as DRE_CategoriaReceitaBruta;
  const { data, error } = await supabase
    .from("dre_receita_bruta")
    .insert({
      year,
      month,
      categoria,
      descricao: (body.descricao ?? "").trim(),
      valor: Number(body.valor) || 0,
      taxa: Number(body.taxa) || 0,
      observacao: (body.observacao ?? "").trim(),
    })
    .select("id, year, month, categoria, descricao, valor, taxa, observacao")
    .single();

  if (error) {
    throw new Error(`DRE criar receita bruta: ${error.message}`);
  }
  return rowToItem(data as Row);
}

export async function updateReceitaBruta(
  id: string,
  year: number,
  month: number,
  body: ReceitaBrutaUpdateBody
): Promise<ReceitaBrutaItem> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("dre_receita_bruta")
    .update({
      descricao: (body.descricao ?? "").trim(),
      valor: Number(body.valor) || 0,
      taxa: Number(body.taxa) || 0,
      observacao: (body.observacao ?? "").trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("year", year)
    .eq("month", month)
    .select("id, year, month, categoria, descricao, valor, taxa, observacao")
    .single();

  if (error) {
    throw new Error(`DRE atualizar receita bruta: ${error.message}`);
  }
  if (!data) {
    throw new Error("Registo não encontrado ou não pertence ao período");
  }
  return rowToItem(data as Row);
}

export async function deleteReceitaBruta(
  id: string,
  year: number,
  month: number
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("dre_receita_bruta")
    .delete()
    .eq("id", id)
    .eq("year", year)
    .eq("month", month);

  if (error) {
    throw new Error(`DRE excluir receita bruta: ${error.message}`);
  }
}
