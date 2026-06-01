import crypto from "node:crypto";
import { DateTime } from "luxon";
import { ENV } from "../config/env.js";
import { vendusPost } from "../infra/vendusClient.js";
import {
  loadProductCatalog,
  getCatalogEntry,
} from "../infra/vendusProductsCatalog.js";
import { getSupabaseServiceRole } from "../infra/supabaseClient.js";
import { getUberEatsAccessToken } from "./uberEatsTokenService.js";
import type {
  UberEatsWebhookPayload,
  UberEatsOrder,
  UberEatsOrderItem,
} from "../domain/uberEatsTypes.js";

const CASH_PAYMENT_ID = 275787584;

// ─── Signature ───────────────────────────────────────────────────────────────

function verifySignature(
  rawBody: Buffer,
  signature: string | undefined
): boolean {
  // Sem secret configurado → aceitar (útil em dev/testes)
  if (!ENV.UBER_EATS_WEBHOOK_CLIENT_SECRET) return true;
  if (!signature) return false;

  const hash = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;

  const expected = crypto
    .createHmac("sha256", ENV.UBER_EATS_WEBHOOK_CLIENT_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(hash, "hex")
    );
  } catch {
    return false;
  }
}

// ─── Uber Eats API ────────────────────────────────────────────────────────────

async function fetchUberOrder(orderId: string): Promise<UberEatsOrder> {
  const token = await getUberEatsAccessToken();
  const res = await fetch(`https://api.uber.com/v2/eats/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Uber Eats API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<UberEatsOrder>;
}

// ─── Idempotência (Supabase: uber_eats_orders) ───────────────────────────────

async function isAlreadyProcessed(orderId: string): Promise<boolean> {
  const sb = getSupabaseServiceRole();
  if (!sb) {
    console.warn("[uber-eats] Supabase não configurado — idempotência desativada");
    return false;
  }
  const { data } = await sb
    .from("uber_eats_orders")
    .select("id")
    .eq("uber_order_id", orderId)
    .maybeSingle();
  return data !== null;
}

async function saveProcessedOrder(
  orderId: string,
  displayId: string,
  vendusDocId: number,
  vendusDocNumber: string
): Promise<void> {
  const sb = getSupabaseServiceRole();
  if (!sb) return;
  await sb.from("uber_eats_orders").insert({
    uber_order_id: orderId,
    uber_display_id: displayId,
    vendus_doc_id: String(vendusDocId),
    vendus_doc_number: vendusDocNumber,
    status: "created",
  });
}

// ─── Mapeamento de itens ──────────────────────────────────────────────────────

type VendusItemInput = {
  reference?: string;
  title: string;
  qty: number;
  amounts: { gross_unit: string };
};

function resolveItem(item: UberEatsOrderItem): VendusItemInput {
  const unitPrice = (item.price.unit_price.amount / 100).toFixed(2);

  // 1. Por external_data (referência configurada no menu Uber Eats)
  if (item.external_data) {
    const entry = getCatalogEntry({ reference: item.external_data });
    if (entry) {
      return {
        reference: entry.reference,
        title: item.title,
        qty: item.quantity,
        amounts: { gross_unit: unitPrice },
      };
    }
  }

  // 2. Por título normalizado (match contra catálogo Vendus)
  const entry = getCatalogEntry({ title: item.title });
  if (entry) {
    return {
      reference: entry.reference,
      title: item.title,
      qty: item.quantity,
      amounts: { gross_unit: unitPrice },
    };
  }

  // 3. Fallback — sem referência; item não está no catálogo Vendus
  console.warn(
    `[uber-eats] item sem referência Vendus: "${item.title}" (external_data: ${item.external_data ?? "n/a"})`
  );
  return { title: item.title, qty: item.quantity, amounts: { gross_unit: unitPrice } };
}

function buildVendusItems(cartItems: UberEatsOrderItem[]): VendusItemInput[] {
  const items: VendusItemInput[] = [];

  for (const cartItem of cartItems) {
    items.push(resolveItem(cartItem));

    // Modificadores com preço extra → linha separada
    for (const group of cartItem.selected_modifier_groups ?? []) {
      for (const mod of group.selected_items) {
        if (mod.price.unit_price.amount > 0) {
          items.push({
            title: `  + ${mod.title}`,
            qty: mod.quantity,
            amounts: {
              gross_unit: (mod.price.unit_price.amount / 100).toFixed(2),
            },
          });
        }
      }
    }
  }

  return items;
}

// ─── Handler principal ────────────────────────────────────────────────────────

export type WebhookResult =
  | { status: "ok"; vendusDoc: string }
  | { status: "skipped"; reason: string };

export async function handleUberEatsWebhook(
  rawBody: Buffer,
  signature: string | undefined
): Promise<WebhookResult> {
  if (!verifySignature(rawBody, signature)) {
    throw Object.assign(new Error("Assinatura inválida"), { statusCode: 401 });
  }

  const payload = JSON.parse(rawBody.toString("utf-8")) as UberEatsWebhookPayload;

  if (payload.event_type !== "orders.notification") {
    return { status: "skipped", reason: `event_type não suportado: ${payload.event_type}` };
  }

  const orderStatus = payload.meta?.status;
  if (orderStatus !== "ACCEPTED") {
    return { status: "skipped", reason: `status: ${orderStatus ?? "desconhecido"}` };
  }

  const orderId = payload.resource_id;

  if (await isAlreadyProcessed(orderId)) {
    return { status: "skipped", reason: "order já processada" };
  }

  const order = await fetchUberOrder(orderId);

  // Garante catálogo atualizado para fazer match por título
  await loadProductCatalog();

  const items = buildVendusItems(order.cart.items);
  const totalAmount = (order.payment.charges.total.amount / 100).toFixed(2);

  const doc = await vendusPost<{ id: number; number: string }>("/documents/", {
    type: "FT",
    date: DateTime.now().setZone("Europe/Lisbon").toFormat("yyyy-MM-dd"),
    register_id: ENV.UBER_EATS_VENDUS_REGISTER_ID,
    store_id: ENV.UBER_EATS_VENDUS_STORE_ID,
    observations: `Uber Eats #${order.display_id}`,
    items,
    payments: [{ id: CASH_PAYMENT_ID, amount: totalAmount }],
  });

  await saveProcessedOrder(orderId, order.display_id, doc.id, doc.number);

  console.log(
    `[uber-eats] FT criada: ${doc.number} — order ${order.display_id} (${totalAmount} EUR)`
  );
  return { status: "ok", vendusDoc: doc.number };
}
