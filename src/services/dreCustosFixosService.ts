import type {
  CustosFixoItem,
  CustosFixosCreateBody,
  CustosFixosUpdateBody,
} from "../domain/dreTypes.js";
import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";

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
  organizationId: OrganizationId,
  year: number,
  month: number,
): Promise<CustosFixoItem[]> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("dre_custos_fixos")
    .select("id, year, month, descricao, valor, valor_sem_iva, observacao")
    .eq("year", year)
    .eq("month", month)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`DRE custos fixos: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0 && process.env.NODE_ENV !== "test") {
    console.warn(
      `[DRE custos fixos] 0 rows for year=${year} month=${month}. Seed data is year=2026, months 2-12. Check Supabase env and query params.`,
    );
  }
  return rows.map(rowToItem);
}

export async function createCustoFixo(
  organizationId: OrganizationId,
  year: number,
  month: number,
  body: CustosFixosCreateBody,
): Promise<CustosFixoItem> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("dre_custos_fixos")
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
  return rowToItem(data as unknown as Row);
}

export async function updateCustoFixo(
  organizationId: OrganizationId,
  id: string,
  year: number,
  month: number,
  body: CustosFixosUpdateBody,
): Promise<CustosFixoItem> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("dre_custos_fixos")
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
  return rowToItem(data as unknown as Row);
}

export async function deleteCustoFixo(
  organizationId: OrganizationId,
  id: string,
  year: number,
  month: number,
): Promise<void> {
  const { error } = await createScopedQuery(organizationId)
    .table("dre_custos_fixos")
    .delete()
    .eq("id", id)
    .eq("year", year)
    .eq("month", month);

  if (error) {
    throw new Error(`DRE excluir custo fixo: ${error.message}`);
  }
}
