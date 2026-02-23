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

/** Mapeamento: método de pagamento Vendus → section DRE (dinheiro | tpa | apps) */
const PAYMENT_METHOD_SECTION: Record<string, DRE_CategoriaReceitaBruta> = {
  Dinheiro: "dinheiro",
  Multibanco: "tpa",
  "Transferência Bancária": "apps",
};
const DEFAULT_SECTION: DRE_CategoriaReceitaBruta = "apps";

function sectionForPaymentMethod(method: string): DRE_CategoriaReceitaBruta {
  return PAYMENT_METHOD_SECTION[method] ?? DEFAULT_SECTION;
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
  const descricao = CATEGORY_LABELS[category];
  const taxaPct = SECTION_TAXA[section];
  const valor = Math.round(valorBruto * 100) / 100;
  const taxa = Math.round(valorBruto * (taxaPct / 100) * 100) / 100;

  return {
    id: `${category}-${section}`,
    descricao,
    valor,
    taxa,
  };
}

/**
 * Receita bruta a partir do Vendus (by_category_overall + payment_methods).
 * Sem persistência; não há create/update/delete.
 */
export async function getReceitaBruta(
  year: number,
  month: number
): Promise<ReceitaBrutaPayload> {
  const { since, until } = getMonthBounds(year, month);

  const response = await buildMonthlySummary({
    since,
    until,
    type: "FS,NC",
    perPage: ENV.PER_PAGE_DEFAULT,
    concurrency: ENV.CONCURRENCY,
    fetchAllDocuments,
  });

  const byCategory = response.by_category_overall;
  const dinheiro: ReceitaBrutaItem[] = [];
  const tpa: ReceitaBrutaItem[] = [];
  const apps: ReceitaBrutaItem[] = [];

  for (const category of CATEGORIES_ORDER) {
    const entry = byCategory[category];
    if (!entry?.payment_methods?.length) continue;

    const amountsBySection: Record<DRE_CategoriaReceitaBruta, number> = {
      dinheiro: 0,
      tpa: 0,
      apps: 0,
    };

    for (const pm of entry.payment_methods) {
      const section = sectionForPaymentMethod(pm.method ?? "");
      const amount = Number(pm.amount) || 0;
      amountsBySection[section] += amount;
    }

    if (amountsBySection.dinheiro > 0) {
      dinheiro.push(toItem(category, "dinheiro", amountsBySection.dinheiro));
    }
    if (amountsBySection.tpa > 0) {
      tpa.push(toItem(category, "tpa", amountsBySection.tpa));
    }
    if (amountsBySection.apps > 0) {
      apps.push(toItem(category, "apps", amountsBySection.apps));
    }
  }

  return { dinheiro, tpa, apps };
}
