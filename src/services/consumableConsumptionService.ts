/**
 * Calcula o consumo de consumíveis (pratos, caixas, sacos, guardanapos) por dia civil,
 * a partir de documentos Vendus (FS) e registos de autoconsumo.
 *
 * Lógica por pedido (não agregada):
 *   Restaurante → Pratos + Guardanapo Zigzag
 *   Delivery    → Caixa L + Caixa S + Sacolas + Guardanapo Delivery
 *   Autoconsumo → tratado como restaurante
 */
import type { VendusDetailedDocument } from "../domain/types.js";
import { detectChannel } from "../domain/channelDetection.js";
import { fetchAllDocuments } from "./documentsService.js";
import { fetchSelfConsumptionSummarySafe } from "./selfconsumptionService.js";
import { vendusGet } from "../infra/vendusClient.js";
import { mapLimit } from "../utils/mapLimit.js";
import { ENV } from "../config/env.js";

// ── Stock item IDs ──────────────────────────────────────────────────────────

const CONSUMABLE_IDS = {
  PRATO:               "37d1759b-2410-4953-9a15-cc382c9c13f3",
  CAIXA_L:             "53fd8e3b-5952-46c0-8271-93cfd1bdaf1d",
  CAIXA_S:             "985c9071-2216-44b6-a3a1-942a0f162722",
  SACOLA:              "25d7d6cf-e2ef-432d-856e-e2ada4244816",
  GUARDANAPO_DELIVERY: "876c882a-8f14-4cb8-a4df-fd5eb48b732e",
  GUARDANAPO_ZIGZAG:   "47483e1f-216f-4bdc-bc93-5c850e19a8fe",
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

export type ConsumableDebugRow = {
  doc_number: string;
  doc_id: number;
  channel: "restaurant" | "delivery" | "unknown";
  small: number;
  large: number;
  prato: number;
  caixa_l: number;
  caixa_s: number;
  sacola: number;
  guardanapo: number;
  /** "autoconsumo" para registos de autoconsumo */
  source: "fs" | "autoconsumo";
};

// ── Internal helpers ────────────────────────────────────────────────────────

type Totals = {
  prato: number;
  caixa_l: number;
  caixa_s: number;
  sacola: number;
  guardanapo_delivery: number;
  guardanapo_zigzag: number;
};

function emptyTotals(): Totals {
  return { prato: 0, caixa_l: 0, caixa_s: 0, sacola: 0, guardanapo_delivery: 0, guardanapo_zigzag: 0 };
}

function countPizzaSizes(items: VendusDetailedDocument["items"]): { small: number; large: number } {
  let small = 0;
  let large = 0;
  for (const item of items) {
    const title = String(item?.title ?? "").toLowerCase();
    const qty = Number(item?.qty ?? 0);
    if (qty <= 0) continue;
    if (title.includes("(individual)")) small += qty;
    else if (title.includes("(grande)")) large += qty;
  }
  return { small, large };
}

/** Fórmulas restaurante: pratos + guardanapo zigzag. Devolve os deltas aplicados. */
function applyRestaurantFormulas(
  small: number,
  large: number,
  t: Totals,
): { prato: number; guardanapo: number } {
  const prato = large + Math.ceil(small / 2);
  const guardanapo = large * 4 + small * 2;
  t.prato += prato;
  t.guardanapo_zigzag += guardanapo;
  return { prato, guardanapo };
}

/** Fórmulas delivery: caixas + sacos + guardanapo delivery. Devolve os deltas aplicados. */
function applyDeliveryFormulas(
  small: number,
  large: number,
  t: Totals,
): { caixa_l: number; caixa_s: number; sacola: number; guardanapo: number } {
  const caixa_l = large + Math.floor(small / 2);
  const caixa_s = small % 2;
  const sacola = caixa_l > 0 ? Math.ceil(caixa_l / 2) : (caixa_s > 0 ? 1 : 0);
  const guardanapo = large * 4 + small * 2;
  t.caixa_l += caixa_l;
  t.caixa_s += caixa_s;
  t.sacola += sacola;
  t.guardanapo_delivery += guardanapo;
  return { caixa_l, caixa_s, sacola, guardanapo };
}

// ── Main export ─────────────────────────────────────────────────────────────

export type ComputeConsumablesResult = {
  map: Map<string, number>;
  totals: Totals;
  /** Só preenchido quando `debug: true`. */
  debug_rows?: ConsumableDebugRow[];
};

/**
 * Calcula consumíveis para um dia civil (YYYY-MM-DD).
 * Com `debug: true` devolve também uma linha por documento com o canal e quantidades calculadas.
 */
export async function computeConsumablesForDay(
  date: string,
  options?: { debug?: boolean },
): Promise<ComputeConsumablesResult> {
  const totals = emptyTotals();
  const debugRows: ConsumableDebugRow[] = [];
  const wantDebug = options?.debug === true;

  // ── 1. Documentos de venda (FS) ──────────────────────────────────────────
  const { documents } = await fetchAllDocuments(date, date, "FS,NC", ENV.PER_PAGE_DEFAULT);

  // Filtrar FS que foram anulados por NC (igual ao MonthlySummaryBuilder)
  const ncDocs = documents.filter((d) => d.type === "NC");
  const detailedNc = await mapLimit(ncDocs, ENV.CONCURRENCY, (d) =>
    vendusGet<VendusDetailedDocument>(`/documents/${d.id}/`)
  );
  const ncFsNumbers = detailedNc.flatMap((doc) =>
    (doc.related_docs ?? [])
      .filter((d) => d.type === "FS")
      .map((d) => d.number)
  );

  const fsDocs = documents
    .filter((d) => d.type === "FS")
    .filter((d) => !ncFsNumbers.includes(d.number));

  const detailedDocs = await mapLimit(fsDocs, ENV.CONCURRENCY, (d) =>
    vendusGet<VendusDetailedDocument>(`/documents/${d.id}/`)
  );

  for (const doc of detailedDocs) {
    const { small, large } = countPizzaSizes(doc.items ?? []);
    const channel = detectChannel(doc);

    if (small === 0 && large === 0) {
      if (wantDebug) {
        debugRows.push({
          doc_number: doc.number,
          doc_id: doc.id,
          channel,
          small: 0,
          large: 0,
          prato: 0,
          caixa_l: 0,
          caixa_s: 0,
          sacola: 0,
          guardanapo: 0,
          source: "fs",
        });
      }
      continue;
    }

    if (channel === "restaurant") {
      const delta = applyRestaurantFormulas(small, large, totals);
      if (wantDebug) {
        debugRows.push({
          doc_number: doc.number,
          doc_id: doc.id,
          channel,
          small,
          large,
          prato: delta.prato,
          caixa_l: 0,
          caixa_s: 0,
          sacola: 0,
          guardanapo: delta.guardanapo,
          source: "fs",
        });
      }
    } else {
      const delta = applyDeliveryFormulas(small, large, totals);
      if (wantDebug) {
        debugRows.push({
          doc_number: doc.number,
          doc_id: doc.id,
          channel,
          small,
          large,
          prato: 0,
          caixa_l: delta.caixa_l,
          caixa_s: delta.caixa_s,
          sacola: delta.sacola,
          guardanapo: delta.guardanapo,
          source: "fs",
        });
      }
    }
  }

  // ── 2. Autoconsumo → restaurante ─────────────────────────────────────────
  const vsc = await fetchSelfConsumptionSummarySafe({ date_start: date, date_end: date });
  let scIndex = 0;
  for (const record of vsc.records) {
    if (!record || typeof record !== "object") continue;
    const products = (record as Record<string, unknown>).products;
    if (!Array.isArray(products) || products.length === 0) continue;

    let small = 0;
    let large = 0;
    for (const p of products) {
      if (!p || typeof p !== "object") continue;
      const pr = p as Record<string, unknown>;
      const title = String(pr.title ?? "").toLowerCase();
      const qty = Number(pr.qty ?? pr.quantity ?? 0);
      if (qty <= 0) continue;
      if (title.includes("(individual)")) small += qty;
      else if (title.includes("(grande)")) large += qty;
    }
    if (small === 0 && large === 0) continue;

    const delta = applyRestaurantFormulas(small, large, totals);
    if (wantDebug) {
      debugRows.push({
        doc_number: `autoconsumo-${scIndex}`,
        doc_id: -1,
        channel: "restaurant",
        small,
        large,
        prato: delta.prato,
        caixa_l: 0,
        caixa_s: 0,
        sacola: 0,
        guardanapo: delta.guardanapo,
        source: "autoconsumo",
      });
    }
    scIndex++;
  }

  // ── 3. Resultado ─────────────────────────────────────────────────────────
  const map = new Map<string, number>();
  if (totals.prato > 0)               map.set(CONSUMABLE_IDS.PRATO, totals.prato);
  if (totals.caixa_l > 0)             map.set(CONSUMABLE_IDS.CAIXA_L, totals.caixa_l);
  if (totals.caixa_s > 0)             map.set(CONSUMABLE_IDS.CAIXA_S, totals.caixa_s);
  if (totals.sacola > 0)              map.set(CONSUMABLE_IDS.SACOLA, totals.sacola);
  if (totals.guardanapo_delivery > 0) map.set(CONSUMABLE_IDS.GUARDANAPO_DELIVERY, totals.guardanapo_delivery);
  if (totals.guardanapo_zigzag > 0)   map.set(CONSUMABLE_IDS.GUARDANAPO_ZIGZAG, totals.guardanapo_zigzag);

  return {
    map,
    totals,
    ...(wantDebug ? { debug_rows: debugRows } : {}),
  };
}
