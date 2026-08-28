import type {
  ListStockMovementsQuery,
  StockMovement,
  StockMovementCreateBody,
  StockMovementHistoryRow,
  StockMovementType,
  StockMovementUpdateBody,
  StockMovementsPaginatedResponse,
} from "../domain/stockTypes.js";
import { getSupabase, isSupabaseConfigured } from "../infra/scoped-db/supabase-client.js";
import {
  lisbonDayEndUtcIso,
  lisbonDayStartUtcIso,
} from "../utils/lisbonDayInstants.js";

type Row = {
  id: string;
  item_id: string;
  type: string;
  quantity: number;
  unit_cost_per_base_unit_with_vat: number | null;
  unit_cost_per_base_unit_without_vat: number | null;
  reason: string | null;
  reference: string | null;
  movement_date: string;
  created_at: string;
  created_by: string | null;
};

const COLS =
  "id, item_id, type, quantity, unit_cost_per_base_unit_with_vat, unit_cost_per_base_unit_without_vat, reason, reference, movement_date, created_at, created_by";

function rowToMovement(row: Row): StockMovement {
  return {
    id: row.id,
    item_id: row.item_id,
    type: row.type as StockMovementType,
    quantity: Number(row.quantity),
    unit_cost_per_base_unit_with_vat:
      row.unit_cost_per_base_unit_with_vat != null
        ? Number(row.unit_cost_per_base_unit_with_vat)
        : null,
    unit_cost_per_base_unit_without_vat:
      row.unit_cost_per_base_unit_without_vat != null
        ? Number(row.unit_cost_per_base_unit_without_vat)
        : null,
    reason: row.reason ?? null,
    reference: row.reference ?? null,
    movement_date: row.movement_date,
    created_at: row.created_at,
    created_by: row.created_by ?? null,
  };
}

/** Valida e devolve ISO string para movement_date ou null (usa default no DB) */
function parseMovementDate(value: string | null | undefined): string | null {
  if (value == null || (typeof value === "string" && value.trim() === ""))
    return null;
  const s = String(value).trim();
  const date = new Date(s);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function requireSupabase(): NonNullable<ReturnType<typeof getSupabase>> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY"
    );
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não disponível");
  return supabase;
}

const MOVEMENT_TYPES: StockMovementType[] = [
  "purchase",
  "consumption",
  "sale",
  "loss",
  "adjustment",
  "transfer",
];

export function validateMovementType(t: string): t is StockMovementType {
  return MOVEMENT_TYPES.includes(t as StockMovementType);
}

export async function createStockMovement(
  body: StockMovementCreateBody
): Promise<StockMovement> {
  const supabase = requireSupabase();
  if (!body.item_id) throw new Error("item_id é obrigatório");
  if (!validateMovementType(body.type))
    throw new Error(`type inválido: ${body.type}`);
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity)) throw new Error("quantity inválido");
  const movementDate = parseMovementDate(body.movement_date);
  const costWith =
    body.unit_cost_per_base_unit_with_vat != null
      ? Number(body.unit_cost_per_base_unit_with_vat)
      : null;
  const costWithout =
    body.unit_cost_per_base_unit_without_vat != null
      ? Number(body.unit_cost_per_base_unit_without_vat)
      : null;
  if (costWith != null && (costWith < 0 || !Number.isFinite(costWith)))
    throw new Error("unit_cost_per_base_unit_with_vat inválido");
  if (
    costWithout != null &&
    (costWithout < 0 || !Number.isFinite(costWithout))
  )
    throw new Error("unit_cost_per_base_unit_without_vat inválido");
  const payload: Record<string, unknown> = {
    item_id: body.item_id,
    type: body.type,
    quantity,
    unit_cost_per_base_unit_with_vat: costWith,
    unit_cost_per_base_unit_without_vat: costWithout,
    reason: (body.reason ?? "").trim() || null,
    reference: (body.reference ?? "").trim() || null,
    created_by: (body.created_by ?? "").trim() || null,
  };
  if (movementDate) payload.movement_date = movementDate;
  const { data, error } = await supabase
    .from("stock_movements")
    .insert(payload)
    .select(COLS)
    .single();
  if (error) throw new Error(`Criar movimentação: ${error.message}`);
  return rowToMovement(data as Row);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateYmdOrThrow(label: string, value: string): void {
  if (!ISO_DATE.test(value)) {
    throw new Error(`${label} inválido (use YYYY-MM-DD): ${value}`);
  }
  lisbonDayStartUtcIso(value);
}

function categoryFromEmbedded(
  si: Record<string, unknown> | null | undefined
): { category_id: string; category_name: string } {
  if (!si) return { category_id: "", category_name: "" };
  const categoryId = String(si.category_id ?? "");
  const sc = si.stock_categories;
  if (Array.isArray(sc) && sc[0] && typeof sc[0] === "object") {
    const o = sc[0] as Record<string, unknown>;
    return {
      category_id: String(o.id ?? categoryId),
      category_name: String(o.name ?? ""),
    };
  }
  if (sc && typeof sc === "object") {
    const o = sc as Record<string, unknown>;
    return {
      category_id: String(o.id ?? categoryId),
      category_name: String(o.name ?? ""),
    };
  }
  return { category_id: categoryId, category_name: "" };
}

function rowToHistoryRow(row: unknown): StockMovementHistoryRow {
  const r = row as Record<string, unknown>;
  const si = r.stock_items as Record<string, unknown> | null | undefined;
  const { category_id, category_name } = categoryFromEmbedded(si ?? null);
  return {
    id: String(r.id),
    item_id: String(r.item_id),
    item_name: String(si?.name ?? ""),
    item_sku: si?.sku != null ? String(si.sku) : null,
    item_base_unit: String(si?.base_unit ?? ""),
    category_id,
    category_name,
    type: r.type as StockMovementType,
    quantity: Number(r.quantity),
    unit_cost_per_base_unit_with_vat:
      r.unit_cost_per_base_unit_with_vat != null
        ? Number(r.unit_cost_per_base_unit_with_vat)
        : null,
    unit_cost_per_base_unit_without_vat:
      r.unit_cost_per_base_unit_without_vat != null
        ? Number(r.unit_cost_per_base_unit_without_vat)
        : null,
    reason: r.reason != null ? String(r.reason) : null,
    reference: r.reference != null ? String(r.reference) : null,
    movement_date: String(r.movement_date),
    created_at: String(r.created_at),
    created_by: r.created_by != null ? String(r.created_by) : null,
  };
}

const MOVEMENT_HISTORY_SELECT = `
  id,
  item_id,
  type,
  quantity,
  unit_cost_per_base_unit_with_vat,
  unit_cost_per_base_unit_without_vat,
  reason,
  reference,
  movement_date,
  created_at,
  created_by,
  stock_items (
    name,
    sku,
    base_unit,
    category_id,
    stock_categories ( id, name )
  )
`;

/**
 * Histórico global de movimentos com paginação, item e categoria.
 */
export async function listStockMovementsPaginated(
  query: ListStockMovementsQuery
): Promise<StockMovementsPaginatedResponse> {
  if (!isSupabaseConfigured()) {
    return {
      data: [],
      pagination: {
        page: 1,
        page_size: 20,
        total: 0,
        total_pages: 0,
      },
    };
  }
  const supabase = getSupabase();
  if (!supabase) {
    return {
      data: [],
      pagination: {
        page: 1,
        page_size: 20,
        total: 0,
        total_pages: 0,
      },
    };
  }

  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(query.page_size ?? 20)), 100);
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  if (query.date_from) parseDateYmdOrThrow("date_from", query.date_from);
  if (query.date_to) parseDateYmdOrThrow("date_to", query.date_to);

  let categoryItemIds: string[] | undefined;
  if (query.category_id) {
    const { data: catRows, error: catErr } = await supabase
      .from("stock_items")
      .select("id")
      .eq("category_id", query.category_id);
    if (catErr) throw new Error(`Stock items (categoria): ${catErr.message}`);
    categoryItemIds = (catRows ?? []).map((r: { id: string }) => r.id);
    if (categoryItemIds.length === 0) {
      return {
        data: [],
        pagination: { page, page_size: pageSize, total: 0, total_pages: 0 },
      };
    }
  }

  let qb = supabase
    .from("stock_movements")
    .select(MOVEMENT_HISTORY_SELECT, { count: "exact" })
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (categoryItemIds) {
    qb = qb.in("item_id", categoryItemIds);
  }
  if (query.item_id) {
    qb = qb.eq("item_id", query.item_id);
  }
  if (query.type) {
    qb = qb.eq("type", query.type);
  }
  if (query.date_from) {
    qb = qb.gte("movement_date", lisbonDayStartUtcIso(query.date_from));
  }
  if (query.date_to) {
    qb = qb.lte("movement_date", lisbonDayEndUtcIso(query.date_to));
  }

  const { data, error, count } = await qb.range(rangeFrom, rangeTo);

  if (error) throw new Error(`Histórico de movimentos: ${error.message}`);

  const total = count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return {
    data: ((data ?? []) as unknown[]).map(rowToHistoryRow),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    },
  };
}

export async function listStockMovementsByItem(
  itemId: string,
  limit = 100
): Promise<StockMovement[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("stock_movements")
    .select(COLS)
    .eq("item_id", itemId)
    .order("movement_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Stock movements: ${error.message}`);
  return ((data ?? []) as Row[]).map(rowToMovement);
}

export async function getStockMovementById(
  id: string
): Promise<StockMovement | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("stock_movements")
    .select(COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Movimentação: ${error.message}`);
  return data ? rowToMovement(data as Row) : null;
}

export async function updateStockMovement(
  id: string,
  body: StockMovementUpdateBody
): Promise<StockMovement> {
  const supabase = requireSupabase();
  const updates: Record<string, unknown> = {};
  if (body.movement_date !== undefined) {
    const v = parseMovementDate(body.movement_date);
    updates.movement_date = v ?? new Date().toISOString();
  }
  if (body.quantity !== undefined) {
    const q = Number(body.quantity);
    if (!Number.isFinite(q)) throw new Error("quantity inválido");
    updates.quantity = q;
  }
  if (body.unit_cost_per_base_unit_with_vat !== undefined) {
    const v = body.unit_cost_per_base_unit_with_vat;
    updates.unit_cost_per_base_unit_with_vat =
      v == null ? null : Number(v);
    if (
      updates.unit_cost_per_base_unit_with_vat != null &&
      (Number(updates.unit_cost_per_base_unit_with_vat) < 0 ||
        !Number.isFinite(Number(updates.unit_cost_per_base_unit_with_vat)))
    )
      throw new Error("unit_cost_per_base_unit_with_vat inválido");
  }
  if (body.unit_cost_per_base_unit_without_vat !== undefined) {
    const v = body.unit_cost_per_base_unit_without_vat;
    updates.unit_cost_per_base_unit_without_vat =
      v == null ? null : Number(v);
    if (
      updates.unit_cost_per_base_unit_without_vat != null &&
      (Number(updates.unit_cost_per_base_unit_without_vat) < 0 ||
        !Number.isFinite(Number(updates.unit_cost_per_base_unit_without_vat)))
    )
      throw new Error("unit_cost_per_base_unit_without_vat inválido");
  }
  if (body.reason !== undefined)
    updates.reason = (body.reason ?? "").trim() || null;
  if (body.reference !== undefined)
    updates.reference = (body.reference ?? "").trim() || null;
  if (Object.keys(updates).length === 0) {
    const existing = await getStockMovementById(id);
    if (!existing) throw new Error("Movimentação não encontrada");
    return existing;
  }
  const { data, error } = await supabase
    .from("stock_movements")
    .update(updates)
    .eq("id", id)
    .select(COLS)
    .single();
  if (error) throw new Error(`Atualizar movimentação: ${error.message}`);
  return rowToMovement(data as Row);
}
