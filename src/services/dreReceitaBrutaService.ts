import type {
  DRE_CategoriaReceitaBruta,
  ReceitaBrutaItem,
  ReceitaBrutaPayload,
} from "../domain/dreTypes.js";

import { CATEGORIES_ORDER } from "../config/constants.js";
import type { Category } from "../domain/types.js";
import { ENV } from "../config/env.js";
import { buildMonthlySummary } from "./monthlySummaryService.js";
import { fetchAllDocuments } from "./documentsService.js";

/** Último dia do mês em ISO (YYYY-MM-DD) */
function getMonthBounds(
  year: number,
  month: number
): { since: string; until: string } {
  const since = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const until = `${year}-${String(month).padStart(2, "0")}-${String(
    lastDay
  ).padStart(2, "0")}`;
  return { since, until };
}

/** Label por categoria de produto para a descrição do item */
const CATEGORY_LABELS: Record<Category, string> = {
  pizza: "Pizzas",
  bebida_alcoolica: "Bebidas alcoólicas",
  bebida_nao_alcoolica: "Bebidas não alcoólicas",
  sacos: "Embalagens",
  outros: "Outros",
};

const SECTION_SUFFIX: Record<DRE_CategoriaReceitaBruta, string> = {
  dinheiro: "Dinheiro",
  tpa: "TPA",
  apps: "App",
};

const SECTION_TAXA: Record<DRE_CategoriaReceitaBruta, number> = {
  dinheiro: 0,
  tpa: 1,
  apps: 30,
};

function toItem(
  category: Category,
  section: DRE_CategoriaReceitaBruta,
  valorBruto: number
): ReceitaBrutaItem {
  const id = `${category}-${section}`;
  const descricao = CATEGORY_LABELS[category];
  const valor = Math.round(valorBruto * 100) / 100;
  const taxa =
    Math.round(valorBruto * (SECTION_TAXA[section] / 100) * 100) / 100;

  return { id, descricao, valor, taxa };
}

/**
 * Receita bruta a partir do Vendus (by_channel).
 * Restaurant → dinheiro (0% taxa), Delivery → apps (30% taxa).
 * TPA deixou de existir: tudo é registado como dinheiro no POS.
 */
export async function getReceitaBruta(
  year: number,
  month: number
): Promise<ReceitaBrutaPayload> {
  const { since, until } = getMonthBounds(year, month);

  const response = await buildMonthlySummary({
    since,
    until,
    type: "FS,FT,NC",
    perPage: ENV.PER_PAGE_DEFAULT,
    concurrency: ENV.CONCURRENCY,
    fetchAllDocuments,
  });

  const dinheiro: ReceitaBrutaItem[] = [];
  const tpa: ReceitaBrutaItem[] = [];
  const apps: ReceitaBrutaItem[] = [];

  for (const category of CATEGORIES_ORDER) {
    const restaurantGross =
      response.by_channel.restaurant.byCategory[category]?.totals?.gross ?? 0;
    const deliveryGross =
      response.by_channel.delivery.byCategory[category]?.totals?.gross ?? 0;

    if (restaurantGross > 0) {
      dinheiro.push(toItem(category, "dinheiro", restaurantGross));
    }
    if (deliveryGross > 0) {
      apps.push(toItem(category, "apps", deliveryGross));
    }
  }

  const tax_amount = Number(response.totals?.tax_amount) ?? 0;

  return { dinheiro, tpa, apps, tax_amount };
}
