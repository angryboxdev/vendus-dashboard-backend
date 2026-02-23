import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import type { CustosVariaveisItem, CustosVariaveisPayload } from "../domain/dreTypes.js";

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
