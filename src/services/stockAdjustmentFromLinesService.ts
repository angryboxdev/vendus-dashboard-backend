/**
 * Ajuste de stock a partir de linhas de produto Vendus (referência/título + quantidade):
 * calcula o mesmo consumo de ingredientes que o relatório (receitas + mapeamentos) e
 * insere movimentos `type = adjustment` com quantidade **positiva** (entrada).
 *
 * Serve para qualquer cenário de ajuste manual em que queiras o cálculo por receita
 * (ex.: compensar vendas antes de uma contagem, corrigir um lote, simular devolução, etc.).
 */
import { getSupabase, isSupabaseConfigured } from "../infra/supabaseClient.js";
import { lisbonDayEndUtcIso } from "../utils/lisbonDayInstants.js";
import {
  getAllConsumptionMappingsMap,
  type ConsumptionMappingEntry,
} from "./vendusMappingService.js";
import { listPizzaRecipeItems } from "./pizzaRecipeItemService.js";
import { listPizzaRecipes } from "./pizzaRecipeService.js";
import { getPreparationWithItems } from "./preparationService.js";

/** Identifica movimentos criados por este fluxo (filtro para desfazer / relatórios). */
export const STOCK_ADJUSTMENT_FROM_LINES_CREATED_BY = "stock-adjustment-from-lines";

export type StockAdjustmentLine = {
  title?: string;
  reference?: string;
  qty: number;
};

function resolveConsumptionMapping(
  line: StockAdjustmentLine,
  mappings: Map<string, ConsumptionMappingEntry>
): { key: string; mapping: ConsumptionMappingEntry } {
  const ref = line.reference?.trim() ?? "";
  const title = line.title?.trim() ?? "";
  const q = Number(line.qty);
  if (!Number.isFinite(q) || q <= 0) {
    throw new Error(`Linha inválida: qty=${line.qty} (precisa title ou reference + qty > 0)`);
  }
  if (!ref && !title) {
    throw new Error("Cada linha precisa de 'title' ou 'reference' (como em vendus_product_mapping).");
  }

  if (ref) {
    const m = mappings.get(`reference:${ref}`);
    if (m) return { key: `reference:${ref}`, mapping: m };
  }
  if (title) {
    const m = mappings.get(`title:${title}`);
    if (m) return { key: `title:${title}`, mapping: m };
  }

  const hint =
    ref && title
      ? `Tentei reference="${ref}" e title="${title}".`
      : ref
        ? `Tentei reference="${ref}".`
        : `Tentei title="${title}".`;
  const referenceOnlyTip =
    !ref && title
      ? " Os teus mapeamentos são só por referência? Usa o campo JSON \"reference\" com o match_value onde match_by = 'reference' (não uses só o título do produto)."
      : "";
  throw new Error(
    `${hint} Nenhum bate em vendus_product_mapping.${referenceOnlyTip} Ver docs/STOCK_ADJUSTMENT_FROM_LINES.md (query com referencia + nome).`
  );
}

export type StockAdjustmentByItemRow = {
  stock_item_id: string;
  name: string;
  quantity_added: number;
};

export type StockAdjustmentFromLinesResult = {
  adjustment_date: string;
  dry_run: boolean;
  lines_input: number;
  movements_inserted: number;
  /** Valor de `stock_movements.reference` usado neste lote. */
  movement_reference: string;
  by_item: StockAdjustmentByItemRow[];
};

function buildMovementReference(adjustmentDate: string, batchLabel?: string): string {
  const safe = batchLabel?.trim().replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
  if (safe) return `stock-adjustment-lines:${adjustmentDate}:${safe}`;
  return `stock-adjustment-lines:${adjustmentDate}`;
}

function buildReason(adjustmentDate: string, reasonNote?: string): string {
  const note = reasonNote?.trim();
  if (note) {
    return `Ajuste manual (equivalente consumo por receitas) — ${note}`;
  }
  return `Ajuste manual (equivalente consumo por receitas) — ${adjustmentDate}`;
}

/**
 * Mesmo cálculo de consumo por ingrediente que o painel (receitas + mapeamentos).
 * Falha se alguma linha não tiver mapeamento.
 */
export async function computeConsumptionForProductLines(
  lines: StockAdjustmentLine[]
): Promise<Map<string, number>> {
  const mappings = await getAllConsumptionMappingsMap();
  const consumptionByStockId = new Map<string, number>();

  for (const line of lines) {
    const { mapping } = resolveConsumptionMapping(line, mappings);
    const q = Number(line.qty);

    if (mapping.type === "pizza") {
      const recipes = await listPizzaRecipes(mapping.pizza_id);
      const activeRecipe = recipes.find((r) => r.is_active);
      if (!activeRecipe) {
        throw new Error(`Pizza sem receita ativa: pizza_id=${mapping.pizza_id}`);
      }
      const items = await listPizzaRecipeItems(activeRecipe.id);
      const itemsForSize = items.filter((i) => i.size === mapping.pizza_size);
      for (const item of itemsForSize) {
        if (item.stock_item_id) {
          const add = (consumptionByStockId.get(item.stock_item_id) ?? 0) + item.quantity * q;
          consumptionByStockId.set(item.stock_item_id, add);
        } else if (item.preparation_id) {
          const preparation = await getPreparationWithItems(item.preparation_id);
          if (!preparation) continue;
          const factor = preparation.use_as_unit
            ? item.quantity
            : preparation.yield_qty > 0
              ? item.quantity / preparation.yield_qty
              : 0;
          if (factor === 0) continue;
          for (const pi of preparation.items) {
            const add = (consumptionByStockId.get(pi.stock_item_id) ?? 0) + pi.quantity * factor * q;
            consumptionByStockId.set(pi.stock_item_id, add);
          }
        }
      }
    } else {
      const add =
        (consumptionByStockId.get(mapping.stock_item_id) ?? 0) + q;
      consumptionByStockId.set(mapping.stock_item_id, add);
    }
  }

  return consumptionByStockId;
}

/**
 * Igual a `computeConsumptionForProductLines`, mas ignora linhas sem mapeamento / erro.
 * Útil para autoconsumo Vendus com produtos heterogéneos.
 */
export async function computeConsumptionForProductLinesLenient(
  lines: StockAdjustmentLine[]
): Promise<{ map: Map<string, number>; skipped: string[] }> {
  const mappings = await getAllConsumptionMappingsMap();
  const consumptionByStockId = new Map<string, number>();
  const skipped: string[] = [];

  for (const line of lines) {
    try {
      const { mapping } = resolveConsumptionMapping(line, mappings);
      const q = Number(line.qty);

      if (mapping.type === "pizza") {
        const recipes = await listPizzaRecipes(mapping.pizza_id);
        const activeRecipe = recipes.find((r) => r.is_active);
        if (!activeRecipe) {
          skipped.push(`Pizza sem receita ativa: ${line.reference ?? line.title}`);
          continue;
        }
        const items = await listPizzaRecipeItems(activeRecipe.id);
        const itemsForSize = items.filter((i) => i.size === mapping.pizza_size);
        for (const item of itemsForSize) {
          if (item.stock_item_id) {
            const add = (consumptionByStockId.get(item.stock_item_id) ?? 0) + item.quantity * q;
            consumptionByStockId.set(item.stock_item_id, add);
          } else if (item.preparation_id) {
            const preparation = await getPreparationWithItems(item.preparation_id);
            if (!preparation) continue;
            const factor = preparation.use_as_unit
              ? item.quantity
              : preparation.yield_qty > 0
                ? item.quantity / preparation.yield_qty
                : 0;
            if (factor === 0) continue;
            for (const pi of preparation.items) {
              const add = (consumptionByStockId.get(pi.stock_item_id) ?? 0) + pi.quantity * factor * q;
              consumptionByStockId.set(pi.stock_item_id, add);
            }
          }
        }
      } else {
        const add =
          (consumptionByStockId.get(mapping.stock_item_id) ?? 0) + q;
        consumptionByStockId.set(mapping.stock_item_id, add);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skipped.push(msg);
    }
  }

  return { map: consumptionByStockId, skipped };
}

async function enrichByItemWithNames(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  entries: Array<{ stock_item_id: string; quantity_added: number }>
): Promise<StockAdjustmentByItemRow[]> {
  const ids = entries.map((e) => e.stock_item_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("stock_items")
    .select("id, name")
    .in("id", ids);

  if (error) {
    throw new Error(`Ler nomes de stock_items: ${error.message}`);
  }

  const byId = new Map(
    (data ?? []).map((r: { id: string; name: string }) => [r.id, r.name as string])
  );

  const rows: StockAdjustmentByItemRow[] = entries.map((e) => ({
    stock_item_id: e.stock_item_id,
    name: byId.get(e.stock_item_id) ?? "(item não encontrado)",
    quantity_added: e.quantity_added,
  }));

  rows.sort((a, b) =>
    a.name.localeCompare(b.name, "pt", { sensitivity: "base" })
  );
  return rows;
}

/**
 * @param adjustmentDate - Dia civil (YYYY-MM-DD) para `movement_date` (fim do dia Lisboa) e texto do reason.
 * @param batchLabel - Opcional: distingue vários ajustes no mesmo dia (sufixo em `stock_movements.reference`).
 * @param reasonNote - Opcional: texto extra no `reason` (ex.: "contagem física 21/03").
 */
export async function runStockAdjustmentFromLines(options: {
  lines: StockAdjustmentLine[];
  adjustmentDate: string;
  dryRun?: boolean;
  batchLabel?: string;
  reasonNote?: string;
}): Promise<StockAdjustmentFromLinesResult> {
  const { lines, adjustmentDate, dryRun, batchLabel, reasonNote } = options;
  if (!lines.length) {
    throw new Error("Lista de linhas vazia");
  }

  const byItem = await computeConsumptionForProductLines(lines);
  const entries = Array.from(byItem.entries()).map(([stock_item_id, qty]) => ({
    stock_item_id,
    quantity_added: Math.round(qty * 1000) / 1000,
  }));

  if (!isSupabaseConfigured()) {
    throw new Error("Supabase não configurado");
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase indisponível");

  const byItemNamed = await enrichByItemWithNames(supabase, entries);

  const movementDateIso = lisbonDayEndUtcIso(adjustmentDate);
  const reason = buildReason(adjustmentDate, reasonNote);
  const movement_reference = buildMovementReference(adjustmentDate, batchLabel);

  if (dryRun) {
    return {
      adjustment_date: adjustmentDate,
      dry_run: true,
      lines_input: lines.length,
      movements_inserted: 0,
      movement_reference,
      by_item: byItemNamed,
    };
  }

  const rows = entries
    .filter((e) => e.quantity_added > 0)
    .map((e) => ({
      item_id: e.stock_item_id,
      type: "adjustment" as const,
      quantity: e.quantity_added,
      unit_cost_per_base_unit_with_vat: null as number | null,
      unit_cost_per_base_unit_without_vat: null as number | null,
      reason,
      reference: movement_reference,
      created_by: STOCK_ADJUSTMENT_FROM_LINES_CREATED_BY,
      movement_date: movementDateIso,
    }));

  if (rows.length === 0) {
    return {
      adjustment_date: adjustmentDate,
      dry_run: false,
      lines_input: lines.length,
      movements_inserted: 0,
      movement_reference,
      by_item: byItemNamed,
    };
  }

  const { error } = await supabase.from("stock_movements").insert(rows);
  if (error) {
    throw new Error(`Inserir ajustes: ${error.message}`);
  }

  return {
    adjustment_date: adjustmentDate,
    dry_run: false,
    lines_input: lines.length,
    movements_inserted: rows.length,
    movement_reference,
    by_item: byItemNamed,
  };
}

/** @deprecated Usar `StockAdjustmentLine` */
export type ExcludedSaleLine = StockAdjustmentLine;
/** @deprecated Usar `StockAdjustmentByItemRow` */
export type ExcludedSaleByItemRow = StockAdjustmentByItemRow;
/** @deprecated Usar `StockAdjustmentFromLinesResult` */
export type ExcludedSalesAdjustmentResult = StockAdjustmentFromLinesResult;
/** @deprecated Usar `runStockAdjustmentFromLines` */
export async function runExcludedSalesAdjustment(
  options: Parameters<typeof runStockAdjustmentFromLines>[0]
): Promise<StockAdjustmentFromLinesResult> {
  return runStockAdjustmentFromLines(options);
}
