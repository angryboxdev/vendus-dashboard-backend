import type {
  AggTotals,
  Channel,
  MonthlySummaryResponse,
  VendusSelfConsumptionSummary,
} from "../../domain/types.js";

import { CATEGORIES_ORDER } from "../../config/constants.js";
import type { MonthlySummaryState } from "./monthlySummaryState.js";
import { createTotals } from "../../domain/aggregation.js";
import { fromCents } from "../../utils/numbers.js";
import { priceMapConfig } from "../../domain/priceMap.js";
import { getCatalogSize } from "../../infra/vendusProductsCatalog.js";

export type BuildResponseParams = {
  since: string;
  until: string;
  type: string;
  fsDocuments: { store_id?: number }[];
  detailedDocsCount: number;
  documentsCount: number;
  pagesFetched: number;
  startedAt: number;
  unknownItemsCount: number;
  unknownItemsSample: MonthlySummaryState["unknownItems"];
  vendusSelfConsumption?: VendusSelfConsumptionSummary;
};

function totalsToEuros(t: AggTotals): AggTotals {
  return {
    ...t,
    gross: fromCents(t.gross),
    net: fromCents(t.net),
    tax_amount: fromCents(t.tax_amount),
    units_count: t.units_count,
    documents_count: t.documents_count,
    items_count: t.items_count,
  };
}

export function buildMonthlySummaryResponse(
  state: MonthlySummaryState,
  params: BuildResponseParams
): MonthlySummaryResponse {
  const {
    since,
    until,
    type,
    fsDocuments,
    detailedDocsCount,
    documentsCount,
    pagesFetched,
    startedAt,
    unknownItemsCount,
    unknownItemsSample,
    vendusSelfConsumption,
  } = params;

  const byCategoryOverall: MonthlySummaryResponse["by_category_overall"] =
    {} as MonthlySummaryResponse["by_category_overall"];
  for (const category of CATEGORIES_ORDER) {
    const byCategoryOverallTotals = createTotals();
    for (const channel of ["restaurant", "delivery", "take_away", "unknown"] as Channel[]) {
      const ct = state.byChannel[channel].byCategory[category].totals;
      byCategoryOverallTotals.gross += ct.gross;
      byCategoryOverallTotals.net += ct.net;
      byCategoryOverallTotals.tax_amount += ct.tax_amount;
      byCategoryOverallTotals.units_count += ct.units_count;
      byCategoryOverallTotals.items_count += ct.items_count;
    }
    byCategoryOverall[category] = {
      totals: totalsToEuros(byCategoryOverallTotals),
    };
  }

  const productsOverall = Array.from(state.productsMap.values())
    .map((p) => ({
      ...p,
      amounts: {
        gross_total: fromCents(p.amounts.gross_total),
        net_total: fromCents(p.amounts.net_total),
        tax_total: fromCents(p.amounts.tax_total),
        avg_gross_unit:
          p.qty > 0 ? fromCents(p.amounts.gross_total) / p.qty : 0,
        avg_net_unit: p.qty > 0 ? fromCents(p.amounts.net_total) / p.qty : 0,
      },
      channels: {
        restaurant: {
          ...p.channels.restaurant,
          gross_total: fromCents(p.channels.restaurant.gross_total),
          net_total: fromCents(p.channels.restaurant.net_total),
        },
        delivery: {
          ...p.channels.delivery,
          gross_total: fromCents(p.channels.delivery.gross_total),
          net_total: fromCents(p.channels.delivery.net_total),
        },
        take_away: {
          ...p.channels.take_away,
          gross_total: fromCents(p.channels.take_away.gross_total),
          net_total: fromCents(p.channels.take_away.net_total),
        },
        unknown: {
          ...p.channels.unknown,
          gross_total: fromCents(p.channels.unknown.gross_total),
          net_total: fromCents(p.channels.unknown.net_total),
        },
      },
    }))
    .sort((a, b) => b.amounts.gross_total - a.amounts.gross_total);

  const buildChannelEntry = (channel: Channel) => ({
    totals: totalsToEuros(state.byChannel[channel].totals),
    byCategory: Object.fromEntries(
      CATEGORIES_ORDER.map((cat) => [
        cat,
        {
          totals: totalsToEuros(
            state.byChannel[channel].byCategory[cat].totals
          ),
          products: state.byChannel[channel].byCategory[cat].products,
        },
      ])
    ) as MonthlySummaryResponse["by_channel"]["restaurant"]["byCategory"],
  });

  return {
    period: { since, until, timezone: "Europe/Lisbon" },
    source: {
      store_id: fsDocuments?.[0]?.store_id ?? null,
      documents_count: fsDocuments.length,
      documents_types: type.split(","),
    },
    totals: {
      gross: fromCents(state.totals.gross),
      net: fromCents(state.totals.net),
      tax_amount: fromCents(state.totals.tax_amount),
      tax_breakdown: Array.from(state.taxMap.values())
        .sort((a, b) => a.rate - b.rate)
        .map((x) => ({
          ...x,
          base: fromCents(x.base),
          amount: fromCents(x.amount),
          total: fromCents(x.total),
        })),
      units_count: state.totals.units_count,
      documents_count: state.totals.documents_count,
      items_count: state.totals.items_count,
    },
    by_channel: {
      restaurant: buildChannelEntry("restaurant"),
      delivery: buildChannelEntry("delivery"),
      unknown: {
        totals: totalsToEuros(state.byChannel.unknown.totals),
        notes: "itens não mapeados por preço ou preço fora da tolerância",
        by_category: Object.fromEntries(
          CATEGORIES_ORDER.map((cat) => [
            cat,
            {
              totals: totalsToEuros(
                state.byChannel.unknown.byCategory[cat].totals
              ),
              products: state.byChannel.unknown.byCategory[cat].products,
            },
          ])
        ) as MonthlySummaryResponse["by_channel"]["unknown"]["by_category"],
      },
    },
    by_category_overall: byCategoryOverall,
    products_overall: productsOverall,
    ...(vendusSelfConsumption !== undefined
      ? { vendus_selfconsumption: vendusSelfConsumption }
      : {}),
    debug: {
      took_ms: Date.now() - startedAt,
      pages_fetched: pagesFetched,
      documents_fetched: documentsCount,
      documents_detailed_fetched: detailedDocsCount,
      rate_limit_notes: "",
      unknown_items_count: unknownItemsCount,
      unknown_items_sample: unknownItemsSample.slice(0, 50).map((u) => ({
        doc_id: u.doc_id,
        doc_number: u.doc_number,
        title: u.title,
        reference: u.reference,
        qty: u.qty,
        gross_unit: Number(u.gross_unit) || 0,
        gross_total: u.gross_total,
      })),
      price_map: {
        version: priceMapConfig.version,
        tolerance: priceMapConfig.tolerance,
        mapped_products_count: getCatalogSize(),
      },
    },
  };
}
