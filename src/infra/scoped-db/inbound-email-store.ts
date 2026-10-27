import { mintOrganizationId, type OrganizationId } from "../../kernel/organization-id.js";
import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * Faturas por email — a porta SEM organização (como `device-token-lookup.ts`): a empresa de um email só se
 * sabe pelo destinatário, por isso (1) procurar o endereço pelo identificador e (2) registar o evento do webhook
 * (idempotência, tabela técnica `inbound_email_events` sem org_id) acontecem antes de haver organização.
 * Único sítio de `src/**` que lê `invoice_inbound_addresses` sem filtro de empresa.
 */

function client() {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");
  return supabase;
}

export interface InboundAddressRow {
  organizationId: OrganizationId;
  id: string;
  localPart: string;
  status: "active" | "inactive";
  createdAt: Date;
  createdBy: string | null;
  deactivatedAt: Date | null;
  deactivatedBy: string | null;
  deactivationReason: string | null;
}

export async function findInboundAddressByLocalPart(localPart: string): Promise<InboundAddressRow | null> {
  const { data, error } = await client()
    .from("invoice_inbound_addresses")
    .select("id, org_id, local_part, status, created_at, created_by, deactivated_at, deactivated_by, deactivation_reason")
    .eq("local_part", localPart)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    organizationId: mintOrganizationId(r.org_id as string),
    id: r.id as string,
    localPart: r.local_part as string,
    status: r.status === "inactive" ? "inactive" : "active",
    createdAt: new Date(r.created_at as string),
    createdBy: (r.created_by as string | null) ?? null,
    deactivatedAt: r.deactivated_at ? new Date(r.deactivated_at as string) : null,
    deactivatedBy: (r.deactivated_by as string | null) ?? null,
    deactivationReason: (r.deactivation_reason as string | null) ?? null,
  };
}

/**
 * Regista o evento. Dois pedidos iguais ao mesmo tempo: o segundo bate na chave única e lê o primeiro.
 * `duplicate` só quando o primeiro já terminou (estado ≠ received); senão `resume`.
 */
export async function recordInboundEmailEvent(event: { webhookId: string; emailId: string; receivedAt: Date }): Promise<{ kind: "new" | "resume"; eventId: string } | { kind: "duplicate" }> {
  const db = client();
  const { data, error } = await db
    .from("inbound_email_events")
    .insert({ webhook_id: event.webhookId, email_id: event.emailId, received_at: event.receivedAt.toISOString(), status: "received" })
    .select("id")
    .maybeSingle();
  if (!error && data) return { kind: "new", eventId: (data as { id: string }).id };
  if (error && error.code !== "23505") throw new Error(error.message);
  let row: { id: string; status: string } | null = null;
  for (const [column, value] of [["webhook_id", event.webhookId], ["email_id", event.emailId]] as const) {
    const existing = await db.from("inbound_email_events").select("id, status").eq(column, value).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      row = existing.data as { id: string; status: string };
      break;
    }
  }
  if (!row) throw new Error("inbound_email_events: conflito sem registo existente");
  return row.status === "received" ? { kind: "resume", eventId: row.id } : { kind: "duplicate" };
}

export async function completeInboundEmailEvent(
  eventId: string,
  result: { status: "accepted" | "quarantined" | "ignored"; organizationId: OrganizationId | null; addressId: string | null; reason: string | null; attachmentsTotal: number; attachmentsAccepted: number },
): Promise<void> {
  const { error } = await client()
    .from("inbound_email_events")
    .update({
      status: result.status,
      org_id: result.organizationId,
      address_id: result.addressId,
      reason: result.reason,
      attachments_total: result.attachmentsTotal,
      attachments_accepted: result.attachmentsAccepted,
    })
    .eq("id", eventId);
  if (error) throw new Error(error.message);
}

export async function countInboundEmailsWithoutPdf(organizationId: OrganizationId, since: Date): Promise<number> {
  const { count, error } = await client()
    .from("inbound_email_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", organizationId)
    .eq("status", "accepted")
    .eq("attachments_accepted", 0)
    .gte("received_at", since.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}
