import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import type {
  CustosFixoItem,
  CustosFixosCreateBody,
  CustosFixosUpdateBody,
} from "../domain/dreTypes.js";

type Row = {
  id: string;
  year: number;
  month: number;
  descricao: string;
  valor: number;
  valor_sem_iva: number;
  observacao: string;
};

function rowToItem(row: Row): CustosFixoItem {
  return {
    id: row.id,
    descricao: row.descricao ?? "",
    valor: Number(row.valor),
    valorSemIva: Number(row.valor_sem_iva),
    observacao: row.observacao ?? "",
  };
}

export async function getCustosFixos(
  year: number,
  month: number
): Promise<CustosFixoItem[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }
  const supabase = getSupabase();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("dre_custos_fixos")
    .select("id, year, month, descricao, valor, valor_sem_iva, observacao")
    .eq("year", year)
    .eq("month", month)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`DRE custos fixos: ${error.message}`);
  }

  const rows = (data ?? []) as Row[];
  return rows.map(rowToItem);
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

export async function createCustoFixo(
  year: number,
  month: number,
  body: CustosFixosCreateBody
): Promise<CustosFixoItem> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("dre_custos_fixos")
    .insert({
      year,
      month,
      descricao: (body.descricao ?? "").trim(),
      valor: Number(body.valor) || 0,
      valor_sem_iva: Number(body.valorSemIva) || 0,
      observacao: (body.observacao ?? "").trim(),
    })
    .select("id, year, month, descricao, valor, valor_sem_iva, observacao")
    .single();

  if (error) {
    throw new Error(`DRE criar custo fixo: ${error.message}`);
  }
  return rowToItem(data as Row);
}

export async function updateCustoFixo(
  id: string,
  year: number,
  month: number,
  body: CustosFixosUpdateBody
): Promise<CustosFixoItem> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("dre_custos_fixos")
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
    .select("id, year, month, descricao, valor, valor_sem_iva, observacao")
    .single();

  if (error) {
    throw new Error(`DRE atualizar custo fixo: ${error.message}`);
  }
  if (!data) {
    throw new Error("Registo não encontrado ou não pertence ao período");
  }
  return rowToItem(data as Row);
}

export async function deleteCustoFixo(
  id: string,
  year: number,
  month: number
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("dre_custos_fixos")
    .delete()
    .eq("id", id)
    .eq("year", year)
    .eq("month", month);

  if (error) {
    throw new Error(`DRE excluir custo fixo: ${error.message}`);
  }
}
