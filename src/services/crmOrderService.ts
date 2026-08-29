import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";
import type { CrmOrder, CrmOrderStatus, OrderCreateBody } from "../domain/crmTypes.js";

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
    amount: Number(row.total_value),
    status: row.status as CrmOrderStatus,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** Lista pedidos de um cliente, ordenados por data desc */
export async function listOrders(organizationId: OrganizationId, customerId: string): Promise<CrmOrder[]> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("crm_orders")
    .select("id, customer_id, order_date, total_value, status, notes, created_at")
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data as unknown as Row[]) ?? []).map(rowToOrder);
}

/** Cria um pedido manual */
export async function createOrder(
  organizationId: OrganizationId,
  customerId: string,
  body: OrderCreateBody
): Promise<CrmOrder> {
  const { data, error } = await createScopedQuery(organizationId)
    .table("crm_orders")
    .insert({
      customer_id: customerId,
      order_date: body.orderDate,
      total_value: body.amount,
      status: body.status ?? "concluído",
      notes: body.notes ?? null,
    })
    .select("id, customer_id, order_date, total_value, status, notes, created_at")
    .single();

  if (error) throw new Error(error.message);
  return rowToOrder(data as unknown as Row);
}

/** Atualiza estado ou notas de um pedido */
export async function updateOrder(
  organizationId: OrganizationId,
  orderId: string,
  patch: Partial<Pick<CrmOrder, "status" | "notes" | "amount" | "orderDate">>
): Promise<CrmOrder> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;
  if (patch.amount !== undefined) dbPatch.total_value = patch.amount;
  if (patch.orderDate !== undefined) dbPatch.order_date = patch.orderDate;

  const { data, error } = await createScopedQuery(organizationId)
    .table("crm_orders")
    .update(dbPatch)
    .eq("id", orderId)
    .select("id, customer_id, order_date, total_value, status, notes, created_at")
    .single();

  if (error) throw new Error(error.message);
  return rowToOrder(data as unknown as Row);
}

/** Resumo agregado de pedidos de um cliente (para cálculo de segmento) */
export async function getOrderSummary(
  organizationId: OrganizationId,
  customerId: string
): Promise<{
  orderCount: number;
  ltv: number;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
}> {
  const orders = await listOrders(organizationId, customerId);
  const completed = orders.filter((o) => o.status === "concluído");

  if (completed.length === 0) {
    return { orderCount: 0, ltv: 0, firstOrderDate: null, lastOrderDate: null };
  }

  const sorted = [...completed].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
  return {
    orderCount: completed.length,
    ltv: completed.reduce((s, o) => s + o.amount, 0),
    firstOrderDate: sorted[0]?.orderDate ?? null,
    lastOrderDate: sorted[sorted.length - 1]?.orderDate ?? null,
  };
}
