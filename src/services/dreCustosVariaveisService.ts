import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";
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
  organizationId: OrganizationId,
  year: number,
  month: number
): Promise<CustosVariaveisPayload> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("dre_custos_variaveis")
    .select("id, year, month, categoria, descricao, valor, valor_sem_iva, observacao")
    .eq("year", year)
    .eq("month", month)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`DRE custos variáveis: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as Row[];
  const producao = rows.filter((r) => r.categoria === "producao").map(rowToItem);
  const venda = rows.filter((r) => r.categoria === "venda").map(rowToItem);

  return { producao, venda };
}

export async function createCustoVariavel(
  organizationId: OrganizationId,
  year: number,
  month: number,
  body: CustosVariaveisCreateBody
): Promise<CustosVariaveisItem> {
  const categoria = body.section as DRE_CategoriaCustosVariaveis;
  const { data, error } = await createScopedQuery(organizationId)
    .table("dre_custos_variaveis")
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
  return rowToItem(data as unknown as Row);
}

export async function updateCustoVariavel(
  organizationId: OrganizationId,
  id: string,
  year: number,
  month: number,
  body: CustosVariaveisUpdateBody
): Promise<CustosVariaveisItem> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("dre_custos_variaveis")
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
  return rowToItem(data as unknown as Row);
}

export async function deleteCustoVariavel(
  organizationId: OrganizationId,
  id: string,
  year: number,
  month: number
): Promise<void> {
  const { error } = await createScopedQuery(organizationId)
    .table("dre_custos_variaveis")
    .delete()
    .eq("id", id)
    .eq("year", year)
    .eq("month", month);

  if (error) {
    throw new Error(`DRE excluir custo variável: ${error.message}`);
  }
}
