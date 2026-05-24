import { getSupabaseServiceRole } from "../infra/supabaseClient.js";
import { calculateSegment } from "../domain/crmSegmentEngine.js";
import { calculateNextFollowUp } from "../domain/crmFollowUpEngine.js";
import { loadParams } from "./crmParameterService.js";
import { listOrders, getOrderSummary } from "./crmOrderService.js";
import { listContactsByCustomer } from "./crmContactService.js";
import type {
  CustomerCreateBody,
  CustomerUpdateBody,
  CrmCustomer,
  CrmCustomerEnriched,
  CrmChannel,
  CrmHowFound,
  CrmOptIn,
  CrmSeg07Path,
  CrmSegment,
} from "../domain/crmTypes.js";

function getDb() {
  const db = getSupabaseServiceRole();
  if (!db) throw new Error("Supabase não configurado");
  return db;
}

type Row = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  preferred_channel: string;
  birthday: string | null;
  how_found: string | null;
  opt_in: string;
  notes: string | null;
  inactive: boolean;
  referred_by: string | null;
  seg07_path: string | null;
  manual_followup_date: string | null;
  registered_at: string;
  created_at: string;
  updated_at: string;
};

const SELECT =
  "id, first_name, last_name, email, phone, preferred_channel, birthday, how_found, opt_in, notes, inactive, referred_by, seg07_path, manual_followup_date, registered_at, created_at, updated_at";

function rowToCustomer(row: Row): CrmCustomer {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    preferredChannel: row.preferred_channel as CrmChannel,
    birthday: row.birthday,
    howFound: (row.how_found as CrmHowFound) ?? null,
    optIn: row.opt_in as CrmOptIn,
    notes: row.notes,
    inactive: row.inactive,
    referredBy: row.referred_by,
    seg07Path: (row.seg07_path as CrmSeg07Path) ?? null,
    manualFollowupDate: row.manual_followup_date ?? null,
    registeredAt: row.registered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Gera o próximo ID sequencial (C001, C002, ...) */
async function nextCustomerId(): Promise<string> {
  const db = getDb();
  const { data } = await db
    .from("crm_customers")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .single();

  if (!data) return "C001";
  const last = (data as { id: string }).id;
  const num = parseInt(last.replace("C", ""), 10);
  return "C" + String(num + 1).padStart(3, "0");
}

/** Enriquece um cliente com métricas calculadas e próximo follow-up */
export async function enrichCustomer(customer: CrmCustomer): Promise<CrmCustomerEnriched> {
  const [params, summary, orders, contacts, tagsResult] = await Promise.all([
    loadParams(),
    getOrderSummary(customer.id),
    listOrders(customer.id),
    listContactsByCustomer(customer.id),
    getDb()
      .from("crm_customer_tags")
      .select("tag_name")
      .eq("customer_id", customer.id),
  ]);

  const tags = ((tagsResult.data as { tag_name: string }[]) ?? []).map((r) => r.tag_name);

  const today = new Date().toISOString().slice(0, 10);
  const daysSinceLast = summary.lastOrderDate
    ? Math.round(
        (new Date(today + "T12:00:00Z").getTime() -
          new Date(summary.lastOrderDate + "T12:00:00Z").getTime()) /
          86400000
      )
    : null;

  const segment = calculateSegment(
    summary.orderCount,
    summary.ltv,
    daysSinceLast,
    customer.inactive,
    params
  );

  let nextFollowUp = calculateNextFollowUp(
    customer,
    segment,
    orders,
    contacts,
    params
  );

  // Reclamação tem prioridade máxima — sobrepõe qualquer follow-up calculado
  const hasComplaintTag = tags.includes("reclamou");
  const sentCen01a = contacts.some((c) => c.scriptCode === "CEN-01a" && c.direction === "Enviado");
  if (hasComplaintTag && !sentCen01a) {
    nextFollowUp = {
      date: today,
      scriptCode: "CEN-01a",
      reason: "Reclamação registada — responder urgentemente",
      isOverdue: false,
      daysUntil: 0,
    };
  }

  // Se o utilizador definiu uma data manual, sobrepõe a data calculada
  if (customer.manualFollowupDate && nextFollowUp) {
    const t = new Date().toISOString().slice(0, 10);
    const daysUntil = Math.round(
      (new Date(customer.manualFollowupDate + "T12:00:00Z").getTime() -
        new Date(t + "T12:00:00Z").getTime()) / 86400000
    );
    nextFollowUp = {
      ...nextFollowUp,
      date: customer.manualFollowupDate,
      isOverdue: daysUntil < 0,
      daysUntil,
      reason: nextFollowUp.reason + " (data manual)",
    };
  } else if (customer.manualFollowupDate && !nextFollowUp) {
    // Mesmo sem follow-up calculado, a data manual cria um
    const t = new Date().toISOString().slice(0, 10);
    const daysUntil = Math.round(
      (new Date(customer.manualFollowupDate + "T12:00:00Z").getTime() -
        new Date(t + "T12:00:00Z").getTime()) / 86400000
    );
    nextFollowUp = {
      date: customer.manualFollowupDate,
      scriptCode: "manual",
      reason: "Follow-up manual",
      isOverdue: daysUntil < 0,
      daysUntil,
    };
  }

  return {
    ...customer,
    segment,
    orderCount: summary.orderCount,
    ltv: summary.ltv,
    avgTicket: summary.orderCount > 0 ? summary.ltv / summary.orderCount : 0,
    firstOrderDate: summary.firstOrderDate,
    lastOrderDate: summary.lastOrderDate,
    daysSinceLastOrder: daysSinceLast,
    tags,
    nextFollowUp,
  };
}

/** Lista de clientes com filtros */
export async function listCustomers(filters: {
  segment?: string;
  tag?: string;
  optIn?: string;
  channel?: string;
  search?: string;
  inactive?: boolean;
  limit?: number;
  offset?: number;
}): Promise<CrmCustomer[]> {
  const db = getDb();
  let q = db.from("crm_customers").select(SELECT);

  if (filters.inactive !== undefined) q = q.eq("inactive", filters.inactive);
  else q = q.eq("inactive", false); // por defeito excluir inativos

  if (filters.optIn)   q = q.eq("opt_in", filters.optIn);
  if (filters.channel) q = q.eq("preferred_channel", filters.channel);
  if (filters.search) {
    q = q.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`
    );
  }

  // Filtro por tag: via subquery
  if (filters.tag) {
    const tagRes = await db
      .from("crm_customer_tags")
      .select("customer_id")
      .eq("tag_name", filters.tag);
    const ids = ((tagRes.data as { customer_id: string }[]) ?? []).map((r) => r.customer_id);
    if (ids.length === 0) return [];
    q = q.in("id", ids);
  }

  q = q.order("id");
  q = q.range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 200) - 1);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data as Row[]) ?? []).map(rowToCustomer);
}

/** Detalhe de um cliente (sem enriquecer) */
export async function getCustomer(id: string): Promise<CrmCustomer | null> {
  const db = getDb();
  const { data, error } = await db
    .from("crm_customers")
    .select(SELECT)
    .eq("id", id.toUpperCase())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToCustomer(data as Row);
}

/** Detalhe enriquecido de um cliente */
export async function getCustomerEnriched(id: string): Promise<CrmCustomerEnriched | null> {
  const customer = await getCustomer(id);
  if (!customer) return null;
  return enrichCustomer(customer);
}

/** Cria cliente (gera ID sequencial) */
export async function createCustomer(body: CustomerCreateBody): Promise<CrmCustomer> {
  const db = getDb();
  const id = await nextCustomerId();

  const { data, error } = await db
    .from("crm_customers")
    .insert({
      id,
      first_name:        body.firstName.trim(),
      last_name:         body.lastName?.trim() ?? null,
      email:             body.email?.trim() ?? null,
      phone:             body.phone?.trim() ?? null,
      preferred_channel: body.preferredChannel ?? "WhatsApp",
      birthday:          body.birthday ?? null,
      how_found:         body.howFound ?? null,
      opt_in:            body.optIn ?? "Pendente",
      notes:             body.notes ?? null,
      referred_by:       body.referredBy ?? null,
      seg07_path:        body.seg07Path ?? null,
      registered_at:     body.registeredAt ?? new Date().toISOString().slice(0, 10),
    })
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return rowToCustomer(data as Row);
}

/** Atualiza campos editáveis de um cliente */
export async function updateCustomer(
  id: string,
  body: CustomerUpdateBody
): Promise<CrmCustomer | null> {
  const db = getDb();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.firstName        !== undefined) patch.first_name        = body.firstName.trim();
  if (body.lastName         !== undefined) patch.last_name         = body.lastName?.trim() ?? null;
  if (body.email            !== undefined) patch.email             = body.email?.trim() ?? null;
  if (body.phone            !== undefined) patch.phone             = body.phone?.trim() ?? null;
  if (body.preferredChannel !== undefined) patch.preferred_channel = body.preferredChannel;
  if (body.birthday         !== undefined) patch.birthday          = body.birthday ?? null;
  if (body.howFound         !== undefined) patch.how_found         = body.howFound ?? null;
  if (body.optIn            !== undefined) patch.opt_in            = body.optIn;
  if (body.notes            !== undefined) patch.notes             = body.notes ?? null;
  if (body.inactive              !== undefined) patch.inactive             = body.inactive;
  if (body.referredBy            !== undefined) patch.referred_by          = body.referredBy ?? null;
  if (body.seg07Path             !== undefined) patch.seg07_path           = body.seg07Path ?? null;
  if (body.manualFollowupDate    !== undefined) patch.manual_followup_date = body.manualFollowupDate ?? null;

  const { data, error } = await db
    .from("crm_customers")
    .update(patch)
    .eq("id", id.toUpperCase())
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return rowToCustomer(data as Row);
}

/** Adiciona/remove tags de um cliente */
export async function updateCustomerTags(
  customerId: string,
  toAdd: string[],
  toRemove: string[]
): Promise<string[]> {
  const db = getDb();

  if (toAdd.length > 0) {
    await db.from("crm_customer_tags").upsert(
      toAdd.map((tag) => ({ customer_id: customerId.toUpperCase(), tag_name: tag })),
      { onConflict: "customer_id,tag_name" }
    );
  }
  if (toRemove.length > 0) {
    await db
      .from("crm_customer_tags")
      .delete()
      .eq("customer_id", customerId.toUpperCase())
      .in("tag_name", toRemove);
  }

  const { data } = await db
    .from("crm_customer_tags")
    .select("tag_name")
    .eq("customer_id", customerId.toUpperCase());

  return ((data as { tag_name: string }[]) ?? []).map((r) => r.tag_name);
}

/** Recalcula e guarda o segmento de todos os clientes (cron diário) */
export async function recalculateAllSegments(): Promise<{ updated: number }> {
  const [customers] = await Promise.all([
    listCustomers({}),
  ]);

  let updated = 0;
  for (const customer of customers) {
    try {
      await enrichCustomer(customer); // apenas recalcula — o segmento é sempre calculado on-the-fly
      updated++;
    } catch {
      // continuar para o próximo
    }
  }
  return { updated };
}
