import { createScopedQuery, type ScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";
import type {
  ContactCreateBody,
  CrmContact,
  CrmContactDirection,
  CrmContactResponse,
  CrmContactStatus,
  CrmChannel,
} from "../domain/crmTypes.js";

type Row = {
  id: string;
  customer_id: string;
  contacted_at: string;
  channel: string | null;
  script_code: string | null;
  direction: string;
  status: string | null;
  response: string | null;
  notes: string | null;
  segment_at_time: string | null;
  tags_added: string[];
  tags_removed: string[];
  created_at: string;
};

function rowToContact(row: Row): CrmContact {
  return {
    id: row.id,
    customerId: row.customer_id,
    contactedAt: row.contacted_at,
    channel: (row.channel as CrmChannel) ?? null,
    scriptCode: row.script_code,
    direction: row.direction as CrmContactDirection,
    status: (row.status as CrmContactStatus) ?? null,
    response: (row.response as CrmContactResponse) ?? null,
    notes: row.notes,
    segmentAtTime: row.segment_at_time,
    tagsAdded: row.tags_added ?? [],
    tagsRemoved: row.tags_removed ?? [],
    createdAt: row.created_at,
  };
}

// tags_added e tags_removed requerem migration 054; incluídas aqui após aplicação
const SELECT =
  "id, customer_id, contacted_at, channel, script_code, direction, status, response, notes, segment_at_time, tags_added, tags_removed, created_at";

const SELECT_BASE =
  "id, customer_id, contacted_at, channel, script_code, direction, status, response, notes, segment_at_time, created_at";

/** Lista contactos de um cliente (mais recentes primeiro) */
export async function listContactsByCustomer(
  organizationId: OrganizationId,
  customerId: string
): Promise<CrmContact[]> {
  const scoped = createScopedQuery(organizationId);

  // Tentar com colunas de tags (requer migration 054); fallback sem elas
  const full = await scoped
    .table("crm_contacts")
    .select(SELECT)
    .eq("customer_id", customerId)
    .order("contacted_at", { ascending: false });

  if (!full.error) {
    return ((full.data as unknown as Row[]) ?? []).map(rowToContact);
  }

  // Fallback: sem colunas tags_added/tags_removed (migration ainda não aplicada)
  const base = await scoped
    .table("crm_contacts")
    .select(SELECT_BASE)
    .eq("customer_id", customerId)
    .order("contacted_at", { ascending: false });

  if (base.error) throw new Error(base.error.message);
  return ((base.data as unknown as Omit<Row, "tags_added" | "tags_removed">[]) ?? []).map((r) =>
    rowToContact({ ...r, tags_added: [], tags_removed: [] })
  );
}

/** Lista global de contactos com filtros opcionais */
export async function listContacts(
  organizationId: OrganizationId,
  filters: {
    customerId?: string;
    scriptCode?: string;
    channel?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<CrmContact[]> {
  let q = createScopedQuery(organizationId).table("crm_contacts").select(SELECT);

  if (filters.customerId) q = q.eq("customer_id", filters.customerId);
  if (filters.scriptCode) q = q.eq("script_code", filters.scriptCode);
  if (filters.channel)    q = q.eq("channel", filters.channel);
  if (filters.status)     q = q.eq("status", filters.status);
  if (filters.dateFrom)   q = q.gte("contacted_at", filters.dateFrom);
  if (filters.dateTo)     q = q.lte("contacted_at", filters.dateTo + "T23:59:59Z");

  q = q.order("contacted_at", { ascending: false });
  q = q.range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 100) - 1);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data as unknown as Row[]) ?? []).map(rowToContact);
}

/** Regista um contacto e aplica tags ao cliente (se indicadas) */
export async function createContact(
  organizationId: OrganizationId,
  body: ContactCreateBody
): Promise<CrmContact> {
  const scoped = createScopedQuery(organizationId);

  // Normalizar timestamp (omitido → agora)
  const rawAt = body.contactedAt ?? new Date().toISOString();
  const contactedAt = rawAt.includes("T") ? rawAt : rawAt + "T10:00:00+01:00";

  const insertPayload: Record<string, unknown> = {
    customer_id:     body.customerId,
    contacted_at:    contactedAt,
    channel:         body.channel ?? null,
    script_code:     body.scriptCode ?? null,
    direction:       body.direction ?? "Enviado",
    status:          body.status ?? null,
    response:        body.response ?? null,
    notes:           body.notes ?? null,
    segment_at_time: body.segmentAtTime ?? null,
  };

  // Tentar com colunas de tags; se falhar (migration não aplicada), repetir sem elas
  let result = await scoped.table("crm_contacts").insert({
    ...insertPayload,
    tags_added:  body.tagsToAdd ?? [],
    tags_removed: body.tagsToRemove ?? [],
  }).select(SELECT).single();

  if (result.error) {
    result = await scoped.table("crm_contacts").insert(insertPayload).select(SELECT_BASE).single();
  }

  const { data, error } = result;

  if (error) throw new Error(error.message);

  // Aplicar tags
  if ((body.tagsToAdd?.length ?? 0) > 0 || (body.tagsToRemove?.length ?? 0) > 0) {
    await applyTagChanges(scoped, body.customerId, body.tagsToAdd ?? [], body.tagsToRemove ?? []);
  }

  return rowToContact(data as unknown as Row);
}

/** Edita status/resposta/notas de um contacto */
export async function updateContact(
  organizationId: OrganizationId,
  id: string,
  patch: Partial<Pick<CrmContact, "status" | "response" | "notes" | "channel">>
): Promise<CrmContact> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.status   !== undefined) dbPatch.status   = patch.status;
  if (patch.response !== undefined) dbPatch.response = patch.response;
  if (patch.notes    !== undefined) dbPatch.notes    = patch.notes;
  if (patch.channel  !== undefined) dbPatch.channel  = patch.channel;

  const { data, error } = await createScopedQuery(organizationId)
    .table("crm_contacts")
    .update(dbPatch)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return rowToContact(data as unknown as Row);
}

async function applyTagChanges(
  scoped: ScopedQuery,
  customerId: string,
  toAdd: string[],
  toRemove: string[]
) {
  if (toAdd.length > 0) {
    await scoped.table("crm_customer_tags").upsert(
      toAdd.map((tag) => ({ customer_id: customerId, tag_name: tag })),
      { onConflict: "customer_id,tag_name" }
    );
  }
  if (toRemove.length > 0) {
    await scoped
      .table("crm_customer_tags")
      .delete()
      .eq("customer_id", customerId)
      .in("tag_name", toRemove);
  }
}
