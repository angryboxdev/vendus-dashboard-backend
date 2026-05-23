import { getSupabaseServiceRole } from "../infra/supabaseClient.js";
import type { CrmOrder, CrmOrderStatus, OrderCreateBody } from "../domain/crmTypes.js";

function getDb() {
  const db = getSupabaseServiceRole();
  if (!db) throw new Error("Supabase não configurado");
  return db;
}

type Row = {
  id: string;
  customer_id: string;
  order_date: string;
  total_value: number;
  status: string;
  notes: string | null;
  created_at: string;
};

function rowToOrder(row: Row): CrmOrder {
  return {
    id: row.id,
    customerId: row.customer_id,
    orderDate: row.order_date,
    totalValue: Number(row.total_value),
    status: row.status as CrmOrderStatus,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** Lista pedidos de um cliente, ordenados por data desc */
export async function listOrders(customerId: string): Promise<CrmOrder[]> {
  const db = getDb();
  const { data, error } = await db
    .from("crm_orders")
    .select("id, customer_id, order_date, total_value, status, notes, created_at")
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data as Row[]) ?? []).map(rowToOrder);
}

/** Cria um pedido manual */
export async function createOrder(customerId: string, body: OrderCreateBody): Promise<CrmOrder> {
  const db = getDb();
  const { data, error } = await db
    .from("crm_orders")
    .insert({
      customer_id: customerId,
      order_date: body.orderDate,
      total_value: body.totalValue,
      status: body.status ?? "concluído",
      notes: body.notes ?? null,
    })
    .select("id, customer_id, order_date, total_value, status, notes, created_at")
    .single();

  if (error) throw new Error(error.message);
  return rowToOrder(data as Row);
}

/** Atualiza estado ou notas de um pedido */
export async function updateOrder(
  orderId: string,
  patch: Partial<Pick<CrmOrder, "status" | "notes" | "totalValue" | "orderDate">>
): Promise<CrmOrder> {
  const db = getDb();
  const dbPatch: Record<string, unknown> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;
  if (patch.totalValue !== undefined) dbPatch.total_value = patch.totalValue;
  if (patch.orderDate !== undefined) dbPatch.order_date = patch.orderDate;

  const { data, error } = await db
    .from("crm_orders")
    .update(dbPatch)
    .eq("id", orderId)
    .select("id, customer_id, order_date, total_value, status, notes, created_at")
    .single();

  if (error) throw new Error(error.message);
  return rowToOrder(data as Row);
}

/** Resumo agregado de pedidos de um cliente (para cálculo de segmento) */
export async function getOrderSummary(customerId: string): Promise<{
  orderCount: number;
  ltv: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
}> {
  const orders = await listOrders(customerId);
  const completed = orders.filter((o) => o.status === "concluído");

  if (completed.length === 0) {
    return { orderCount: 0, ltv: 0, firstOrderDate: null, lastOrderDate: null };
  }

  const sorted = [...completed].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
  return {
    orderCount: completed.length,
    ltv: completed.reduce((s, o) => s + o.totalValue, 0),
    firstOrderDate: sorted[0]?.orderDate ?? null,
    lastOrderDate: sorted[sorted.length - 1]?.orderDate ?? null,
  };
}
