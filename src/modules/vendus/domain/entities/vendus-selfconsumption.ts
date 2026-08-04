import type { VendusCategory } from "./vendus-product.js";

export interface VendusSelfConsumptionProduct {
  reference: string;
  title: string;
  qty: number;
  category: VendusCategory;
}

export interface VendusSelfConsumptionRecord {
  id: string | number;
  datetime: string;
  employeeName: string;
  /** Total monetário do registo (custo interno, não preço de venda). */
  totalSpending: number;
  observations: string;
  products: VendusSelfConsumptionProduct[];
}

export interface VendusSelfConsumptionByEmployee {
  employeeName: string;
  recordCount: number;
  totalSpending: number;
}

export interface VendusSelfConsumptionByCategory {
  category: VendusCategory;
  qty: number;
}

export interface VendusSelfConsumptionTopProduct {
  reference: string;
  title: string;
  category: VendusCategory;
  qty: number;
}

export interface VendusSelfConsumptionAnalytics {
  totalSpending: number;
  recordCount: number;
  /** Soma de qty de todos os produtos em todos os registos. */
  totalItemsConsumed: number;
  byEmployee: VendusSelfConsumptionByEmployee[];
  byCategory: VendusSelfConsumptionByCategory[];
  topProducts: VendusSelfConsumptionTopProduct[];
}

export interface VendusSelfConsumptionResult {
  records: VendusSelfConsumptionRecord[];
  analytics: VendusSelfConsumptionAnalytics;
}
