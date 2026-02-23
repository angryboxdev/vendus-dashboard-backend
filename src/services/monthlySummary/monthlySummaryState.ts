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
  paymentMethodsMap: Map<string, number>;
};

export type ChannelSlot = {
  totals: AggTotals;
  byCategory: Record<Category, ChannelCategorySlot>;
  paymentMethodsMap: Map<string, number>;
};

export type ByChannelState = Record<Channel, ChannelSlot>;

export type MonthlySummaryState = {
  totals: AggTotals;
  taxMap: Map<
    number,
    { rate: number; base: number; amount: number; total: number }
  >;
  byChannel: ByChannelState;
  byCategoryOverallPaymentMaps: Map<Category, Map<string, number>>;
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
  paymentMethodMap: Map<string, { amount: number; docIds: Set<number> }>;
};

export function createChannelCategorySlot(): ChannelCategorySlot {
  return {
    totals: createTotals(),
    products: [],
    paymentMethodsMap: new Map(),
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
    paymentMethodsMap: new Map(),
  };
}

export function createByChannelState(): ByChannelState {
  return {
    restaurant: createChannelSlot(),
    delivery: createChannelSlot(),
    unknown: createChannelSlot(),
  };
}

export function createMonthlySummaryState(): MonthlySummaryState {
  const byCategoryOverallPaymentMaps = new Map<Category, Map<string, number>>();
  for (const cat of CATEGORIES_ORDER) {
    byCategoryOverallPaymentMaps.set(cat, new Map());
  }
  return {
    totals: createTotals(),
    taxMap: new Map(),
    byChannel: createByChannelState(),
    byCategoryOverallPaymentMaps,
    productsMap: new Map(),
    unknownItems: [],
    paymentMethodMap: new Map(),
  };
}
