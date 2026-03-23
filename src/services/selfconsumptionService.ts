/**
 * API Vendus: autoconsumo (selfconsumption) — GET com Basic Auth.
 * A listagem muitas vezes não traz `products`; preenchemos com GET /selfconsumption/{id}/.
 * @see https://www.vendus.pt/ws/v1.1/selfconsumption.doc
 */
import type {
  VendusSelfConsumptionProductLine,
  VendusSelfConsumptionSummary,
} from "../domain/types.js";
import { ENV } from "../config/env.js";
import { vendusGetBasic } from "../infra/vendusClient.js";
import { mapLimit } from "../utils/mapLimit.js";
import type { StockAdjustmentLine } from "./stockAdjustmentFromLinesService.js";

export type VendusSelfConsumptionListResponse = {
  records?: unknown[];
  totalSpending?: number;
  pagesCount?: number;
};

function getRecordId(record: unknown): number | null {
  if (!record || typeof record !== "object") return null;
  const id = (record as Record<string, unknown>).id;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getProductsArray(record: unknown): unknown[] | null {
  if (!record || typeof record !== "object") return null;
  const p = (record as Record<string, unknown>).products;
  return Array.isArray(p) ? p : null;
}

/** A listagem sem linhas de produto precisa do endpoint de detalhe. */
function recordNeedsProductDetail(record: unknown): boolean {
  const products = getProductsArray(record);
  if (products === null) return true;
  return products.length === 0;
}

/**
 * Extrai array de produtos do JSON de detalhe GET /selfconsumption/{id}/
 */
export function extractProductsFromDetailPayload(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;

  if (Array.isArray(d.products) && d.products.length > 0) {
    return d.products;
  }

  const sc = d.selfconsumption;
  if (sc && typeof sc === "object" && !Array.isArray(sc)) {
    const p = (sc as Record<string, unknown>).products;
    if (Array.isArray(p) && p.length > 0) return p;
  }

  if (Array.isArray(sc)) {
    for (const item of sc) {
      if (item && typeof item === "object") {
        const p = (item as Record<string, unknown>).products;
        if (Array.isArray(p) && p.length > 0) return p;
      }
    }
  }

  return [];
}

/**
 * Normaliza uma linha de produto Vendus para referência, nome e quantidade.
 */
export function normalizeSelfConsumptionProduct(
  p: unknown
): VendusSelfConsumptionProductLine | null {
  if (!p || typeof p !== "object") return null;
  const pr = p as Record<string, unknown>;
  const qty = Number(pr.qty ?? pr.quantity ?? 1);
  const ref =
    pr.reference != null ? String(pr.reference).trim() : "";
  const titleRaw =
    pr.title != null
      ? String(pr.title).trim()
      : pr.name != null
        ? String(pr.name).trim()
        : "";
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const title = titleRaw || ref || "(sem nome)";
  return { reference: ref, title, qty };
}

function mergeNormalizedProducts(
  record: unknown,
  rawProducts: unknown[]
): Record<string, unknown> {
  const base =
    record && typeof record === "object"
      ? { ...(record as Record<string, unknown>) }
      : {};
  const products = rawProducts
    .map(normalizeSelfConsumptionProduct)
    .filter((x): x is VendusSelfConsumptionProductLine => x != null);
  return { ...base, products };
}

/**
 * Lista todos os registos no intervalo (paginação quando `pagesCount` > 1).
 */
export async function fetchAllSelfConsumption(options: {
  date_start: string;
  date_end: string;
  store_id?: number;
  search_employee?: number;
}): Promise<{
  records: unknown[];
  totalSpending: number | null;
  pagesFetched: number;
}> {
  const all: unknown[] = [];
  let totalSpending: number | null = null;
  let pagesFetched = 0;
  let pagesCount = 1;
  let page = 1;

  do {
    const query: Record<string, string | number | undefined> = {
      date_start: options.date_start,
      date_end: options.date_end,
      page,
    };
    if (options.store_id != null) query.store_id = options.store_id;
    if (options.search_employee != null) {
      query.search_employee = options.search_employee;
    }

    const data = await vendusGetBasic<VendusSelfConsumptionListResponse>(
      "/selfconsumption/",
      query
    );
    const rec = Array.isArray(data?.records) ? data.records : [];
    all.push(...rec);
    if (page === 1 && data?.totalSpending != null) {
      totalSpending = Number(data.totalSpending);
    }
    pagesCount = Math.max(1, Number(data?.pagesCount) || 1);
    pagesFetched++;
    page++;
  } while (page <= pagesCount && pagesCount > 1 && page <= 500);

  return { records: all, totalSpending, pagesFetched };
}

/**
 * Para cada registo: normaliza `products` existentes ou obtém linhas via detalhe.
 */
export async function enrichSelfConsumptionRecordsWithProducts(
  records: unknown[],
  options?: { concurrency?: number; maxDetailFetches?: number }
): Promise<{
  records: unknown[];
  details_fetched: number;
  details_fetch_truncated: boolean;
}> {
  const concurrency = options?.concurrency ?? ENV.CONCURRENCY;
  const maxFetches =
    options?.maxDetailFetches ?? ENV.SELFCONSUMPTION_MAX_DETAIL_FETCHES;

  const idsNeedingFetch: number[] = [];
  for (const rec of records) {
    if (!recordNeedsProductDetail(rec)) continue;
    const id = getRecordId(rec);
    if (id != null) idsNeedingFetch.push(id);
  }

  const uniqueNeed = [...new Set(idsNeedingFetch)];
  const idsToFetch = uniqueNeed.slice(
    0,
    Math.max(0, Math.floor(maxFetches))
  );
  const details_fetch_truncated = uniqueNeed.length > idsToFetch.length;

  const idToRawProducts = new Map<number, unknown[]>();

  await mapLimit(idsToFetch, concurrency, async (id) => {
    try {
      const detail = await vendusGetBasic<unknown>(
        `/selfconsumption/${id}/`
      );
      idToRawProducts.set(id, extractProductsFromDetailPayload(detail));
    } catch {
      idToRawProducts.set(id, []);
    }
  });

  const enriched = records.map((rec) => {
    const id = getRecordId(rec);
    const existing = getProductsArray(rec);
    let raw: unknown[] =
      Array.isArray(existing) && existing.length > 0 ? [...existing] : [];

    if (raw.length === 0 && id != null && idToRawProducts.has(id)) {
      raw = idToRawProducts.get(id)!;
    }

    return mergeNormalizedProducts(rec, raw);
  });

  return {
    records: enriched,
    details_fetched: idsToFetch.length,
    details_fetch_truncated,
  };
}

function pushLineFromProduct(p: unknown, lines: StockAdjustmentLine[]): void {
  if (!p || typeof p !== "object") return;
  const pr = p as Record<string, unknown>;
  const qty = Number(pr.qty ?? pr.quantity ?? 1);
  const ref = pr.reference != null ? String(pr.reference).trim() : "";
  const title = pr.title != null ? String(pr.title).trim() : "";
  if (!Number.isFinite(qty) || qty <= 0) return;
  if (ref) lines.push({ reference: ref, qty });
  else if (title) lines.push({ title, qty });
}

/**
 * Extrai linhas { reference|title, qty } a partir do payload de listagem/detalhe.
 * Aceita `products` já normalizados (`reference`, `title`, `qty`).
 */
export function extractProductLinesFromSelfConsumptionRecords(
  records: unknown[]
): StockAdjustmentLine[] {
  const lines: StockAdjustmentLine[] = [];
  for (const r of records) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const products = rec.products;
    if (Array.isArray(products) && products.length > 0) {
      for (const p of products) {
        const norm = normalizeSelfConsumptionProduct(p);
        if (norm) {
          if (norm.reference)
            lines.push({ reference: norm.reference, qty: norm.qty });
          else lines.push({ title: norm.title, qty: norm.qty });
          continue;
        }
        pushLineFromProduct(p, lines);
      }
    } else {
      pushLineFromProduct(rec, lines);
    }
  }
  return lines;
}

/**
 * Obtém autoconsumo para o período; em caso de erro devolve `records` vazio e `error`.
 */
export async function fetchSelfConsumptionSummarySafe(options: {
  date_start: string;
  date_end: string;
  store_id?: number;
}): Promise<VendusSelfConsumptionSummary> {
  try {
    const { records, totalSpending, pagesFetched } = await fetchAllSelfConsumption({
      date_start: options.date_start,
      date_end: options.date_end,
      ...(options.store_id != null ? { store_id: options.store_id } : {}),
    });

    const {
      records: enriched,
      details_fetched,
      details_fetch_truncated,
    } = await enrichSelfConsumptionRecordsWithProducts(records);

    const summary: VendusSelfConsumptionSummary = {
      date_start: options.date_start,
      date_end: options.date_end,
      store_id: options.store_id ?? null,
      total_spending: totalSpending,
      records_count: enriched.length,
      records: enriched,
      pages_fetched: pagesFetched,
      details_fetched,
      ...(details_fetch_truncated ? { details_fetch_truncated: true } : {}),
    };
    return summary;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      date_start: options.date_start,
      date_end: options.date_end,
      store_id: options.store_id ?? null,
      total_spending: null,
      records_count: 0,
      records: [],
      pages_fetched: 0,
      error: message,
    };
  }
}
