import type { DREKpisPayload } from "../domain/dreTypes.js";
import { buildMonthlySummary } from "./monthlySummaryService.js";
import { fetchAllDocuments } from "./documentsService.js";
import { getCustosVariaveis } from "./dreCustosVariaveisService.js";
import { getCustosFixos } from "./dreCustosFixosService.js";
import { ENV } from "../config/env.js";

function getMonthBounds(
  year: number,
  month: number
): { since: string; until: string } {
  const since = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const until = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { since, until };
}

function safeDivide(num: number, den: number): number {
  if (!Number.isFinite(den) || den === 0) return 0;
  return Number.isFinite(num) ? num / den : 0;
}

/**
 * KPIs do período: vendas por canal, tickets médios, % receita por canal, CMV % e Custo Fixo %.
 */
export async function getDreKpis(
  year: number,
  month: number
): Promise<DREKpisPayload> {
  const { since, until } = getMonthBounds(year, month);

  const [summary, custosVariaveis, custosFixos] = await Promise.all([
    buildMonthlySummary({
      since,
      until,
      type: "FS,NC",
      perPage: ENV.PER_PAGE_DEFAULT,
      concurrency: ENV.CONCURRENCY,
      fetchAllDocuments,
    }),
    getCustosVariaveis(year, month),
    getCustosFixos(year, month),
  ]);

  const totals = summary.totals;
  const restaurant = summary.by_channel.restaurant.totals;
  const delivery = summary.by_channel.delivery.totals;

  const vendas_loja = restaurant.documents_count ?? 0;
  const vendas_apps = delivery.documents_count ?? 0;
  const vendas_totais = totals.documents_count ?? 0;

  const ticket_medio_bruto = safeDivide(totals.gross ?? 0, vendas_totais);
  const ticket_medio_liquido = safeDivide(totals.net ?? 0, vendas_totais);

  const receitaTotal = totals.gross ?? 0;
  const receita_pct_loja = safeDivide(restaurant.gross ?? 0, receitaTotal);
  const receita_pct_apps = safeDivide(delivery.gross ?? 0, receitaTotal);

  const custosVariaveisProducao = custosVariaveis.producao.reduce(
    (s, i) => s + (Number(i.valor) || 0),
    0
  );
  const custosFixosTotais = custosFixos.reduce(
    (s, i) => s + (Number(i.valor) || 0),
    0
  );
  const receitaLiquida = totals.net ?? 0;

  const cmv_pct = safeDivide(custosVariaveisProducao, receitaLiquida);
  const custo_fixo_pct = safeDivide(custosFixosTotais, receitaLiquida);

  return {
    vendas_loja,
    vendas_apps,
    vendas_totais,
    ticket_medio_bruto: Math.round(ticket_medio_bruto * 100) / 100,
    ticket_medio_liquido: Math.round(ticket_medio_liquido * 100) / 100,
    receita_pct_loja: Math.round(receita_pct_loja * 10000) / 10000,
    receita_pct_apps: Math.round(receita_pct_apps * 10000) / 10000,
    cmv_pct: Math.round(cmv_pct * 10000) / 10000,
    custo_fixo_pct: Math.round(custo_fixo_pct * 10000) / 10000,
  };
}
