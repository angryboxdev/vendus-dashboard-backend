import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import type {
  CustosVariaveisItem,
  CustosVariaveisPayload,
  CustosVariaveisCreateBody,
  CustosVariaveisUpdateBody,
  DRE_CategoriaCustosVariaveis,
} from "../domain/dreTypes.js";

type Row = {
  id: string;
  year: number;
  month: number;
  categoria: string;
  descricao: string;
  valor: number;
  valor_sem_iva: number;
  observacao: string;
};

function rowToItem(row: Row): CustosVariaveisItem {
  return {
    id: row.id,
    descricao: row.descricao ?? "",
    valor: Number(row.valor),
    valorSemIva: Number(row.valor_sem_iva),
    observacao: row.observacao ?? "",
  };
}

export async function getCustosVariaveis(
  year: number,
  month: number
): Promise<CustosVariaveisPayload> {
  if (!isSupabaseConfigured()) {
    return { producao: [], venda: [] };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return { producao: [], venda: [] };
  }

  const { data, error } = await supabase
    .from("dre_custos_variaveis")
    .select("id, year, month, categoria, descricao, valor, valor_sem_iva, observacao")
    .eq("year", year)
    .eq("month", month)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`DRE custos variáveis: ${error.message}`);
  }

  const rows = (data ?? []) as Row[];
  const producao = rows.filter((r) => r.categoria === "producao").map(rowToItem);
  const venda = rows.filter((r) => r.categoria === "venda").map(rowToItem);

  return { producao, venda };
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

export async function createCustoVariavel(
  year: number,
  month: number,
  body: CustosVariaveisCreateBody
): Promise<CustosVariaveisItem> {
  const supabase = requireSupabase();
  const categoria = body.section as DRE_CategoriaCustosVariaveis;
  const { data, error } = await supabase
    .from("dre_custos_variaveis")
    .insert({
      year,
      month,
      categoria,
      descricao: (body.descricao ?? "").trim(),
      valor: Number(body.valor) || 0,
      valor_sem_iva: Number(body.valorSemIva) || 0,
      observacao: (body.observacao ?? "").trim(),
    })
    .select("id, year, month, categoria, descricao, valor, valor_sem_iva, observacao")
    .single();

  if (error) {
    throw new Error(`DRE criar custo variável: ${error.message}`);
  }
  return rowToItem(data as Row);
}

export async function updateCustoVariavel(
  id: string,
  year: number,
  month: number,
  body: CustosVariaveisUpdateBody
): Promise<CustosVariaveisItem> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("dre_custos_variaveis")
    .update({
      descricao: (body.descricao ?? "").trim(),
      valor: Number(body.valor) || 0,
      valor_sem_iva: Number(body.valorSemIva) || 0,
      observacao: (body.observacao ?? "").trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("year", year)
    .eq("month", month)
    .select("id, year, month, categoria, descricao, valor, valor_sem_iva, observacao")
    .single();

  if (error) {
    throw new Error(`DRE atualizar custo variável: ${error.message}`);
  }
  if (!data) {
    throw new Error("Registo não encontrado ou não pertence ao período");
  }
  return rowToItem(data as Row);
}

export async function deleteCustoVariavel(
  id: string,
  year: number,
  month: number
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("dre_custos_variaveis")
    .delete()
    .eq("id", id)
    .eq("year", year)
    .eq("month", month);

  if (error) {
    throw new Error(`DRE excluir custo variável: ${error.message}`);
  }
}
