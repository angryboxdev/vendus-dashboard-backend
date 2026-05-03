import type {
  AggTotals,
  Category,
  Channel,
  ProductAgg,
} from "../../domain/types.js";

import { CATEGORIES_ORDER } from "../../config/constants.js";
import { createTotals } from "../../domain/aggregation.js";

export type ChannelCategorySlot = {
  totals: AggTotals;
  products: ProductAgg[];
};

export type ChannelSlot = {
  totals: AggTotals;
  byCategory: Record<Category, ChannelCategorySlot>;
};

export type ByChannelState = Record<Channel, ChannelSlot>;

export type MonthlySummaryState = {
  totals: AggTotals;
  taxMap: Map<
    number,
    { rate: number; base: number; amount: number; total: number }
  >;
  byChannel: ByChannelState;
  productsMap: Map<string, ProductAgg>;
  unknownItems: Array<{
    doc_id: number;
    doc_number: string;
    title: string;
    reference: string;
    qty: number;
    gross_unit: string;
    gross_total: number;
  }>;
};

export function createChannelCategorySlot(): ChannelCategorySlot {
  return {
    totals: createTotals(),
    products: [],
  };
}

export function createChannelSlot(): ChannelSlot {
  const byCategory = {} as Record<Category, ChannelCategorySlot>;
  for (const cat of CATEGORIES_ORDER) {
    byCategory[cat] = createChannelCategorySlot();
  }
  return {
    totals: createTotals(),
    byCategory,
  };
}

export function createByChannelState(): ByChannelState {
  return {
    restaurant: createChannelSlot(),
    delivery: createChannelSlot(),
    take_away: createChannelSlot(),
    unknown: createChannelSlot(),
  };
}

export function createMonthlySummaryState(): MonthlySummaryState {
  return {
    totals: createTotals(),
    taxMap: new Map(),
    byChannel: createByChannelState(),
    productsMap: new Map(),
    unknownItems: [],
  };
}
