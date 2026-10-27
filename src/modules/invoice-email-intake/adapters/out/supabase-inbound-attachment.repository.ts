import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InboundAttachment, InboundAttachmentStatus } from "../../domain/entities/inbound-attachment.js";
import type { InboundAttachmentRepositoryPort, NewInboundAttachment } from "../../domain/ports/out/email-intake.out-ports.js";

const TABLE = "invoice_inbound_attachments";
const STATUSES: InboundAttachmentStatus[] = ["received", "processing", "imported", "duplicate", "read_error", "rejected"];

function toEntity(r: Record<string, unknown>): InboundAttachment {
  const date = (v: unknown) => (v ? new Date(v as string) : null);
  return {
    id: r.id as string,
    eventId: r.event_id as string,
    addressId: r.address_id as string,
    emailId: r.email_id as string,
    attachmentId: r.attachment_id as string,
    filename: r.filename as string,
    contentType: (r.content_type as string | null) ?? null,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    sender: (r.sender as string | null) ?? null,
    receivedAt: new Date(r.received_at as string),
    destination: r.destination === "stock" ? "stock" : "finance",
    status: r.status as InboundAttachmentStatus,
    invoiceId: (r.invoice_id as string | null) ?? null,
    fileSha256: (r.file_sha256 as string | null) ?? null,
    errorCode: (r.error_code as string | null) ?? null,
    errorMessage: (r.error_message as string | null) ?? null,
    attempts: Number(r.attempts ?? 0),
    nextAttemptAt: date(r.next_attempt_at),
    lockedAt: date(r.locked_at),
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

export class SupabaseInboundAttachmentRepository implements InboundAttachmentRepositoryPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async insertMany(organizationId: OrganizationId, rows: NewInboundAttachment[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.scopedQuery(organizationId)
      .table(TABLE)
      .upsert(
        rows.map((r) => ({
          event_id: r.eventId,
          address_id: r.addressId,
          email_id: r.emailId,
          attachment_id: r.attachmentId,
          filename: r.filename,
          content_type: r.contentType,
          size_bytes: r.sizeBytes,
          sender: r.sender,
          received_at: r.receivedAt.toISOString(),
          destination: r.destination,
          status: r.status ?? "received",
          error_code: r.errorCode ?? null,
          error_message: r.errorMessage ?? null,
        })),
        { onConflict: "email_id,attachment_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
  }

  async findDue(organizationId: OrganizationId, now: Date, staleBefore: Date, limit: number): Promise<InboundAttachment[]> {
    const { data, error } = await this.scopedQuery(organizationId)
      .table(TABLE)
      .select("*")
      .or(
        `status.eq.received,and(status.eq.read_error,next_attempt_at.lte.${now.toISOString()}),and(status.eq.processing,locked_at.lt.${staleBefore.toISOString()})`,
      )
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEntity);
  }

  async claim(organizationId: OrganizationId, a: InboundAttachment, now: Date): Promise<InboundAttachment | null> {
    // Condicional ao estado e ao nº de tentativas lidos (cada reserva incrementa-o): se outro processo o apanhou,
    // não apanha nada. Não pela hora de alteração: a base guarda microssegundos e o Date só milissegundos —
    // a comparação nunca batia e os anexos ficavam para sempre «Recebido» (corrigido 2026-10-27).
    const { data, error } = await this.scopedQuery(organizationId)
      .table(TABLE)
      .update({ status: "processing", locked_at: now.toISOString(), attempts: a.attempts + 1, updated_at: now.toISOString() })
      .eq("id", a.id)
      .eq("status", a.status)
      .eq("attempts", a.attempts)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toEntity(data as unknown as Record<string, unknown>) : null;
  }

  async update(organizationId: OrganizationId, a: InboundAttachment): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table(TABLE)
      .update({
        status: a.status,
        invoice_id: a.invoiceId,
        file_sha256: a.fileSha256,
        error_code: a.errorCode,
        error_message: a.errorMessage,
        attempts: a.attempts,
        next_attempt_at: a.nextAttemptAt?.toISOString() ?? null,
        locked_at: a.lockedAt?.toISOString() ?? null,
        updated_at: a.updatedAt.toISOString(),
      })
      .eq("id", a.id);
    if (error) throw new Error(error.message);
  }

  async listRecent(organizationId: OrganizationId, limit: number): Promise<InboundAttachment[]> {
    const { data, error } = await this.scopedQuery(organizationId).table(TABLE).select("*").order("received_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toEntity);
  }

  async countSince(organizationId: OrganizationId, since: Date): Promise<Record<InboundAttachmentStatus, number> & { retrying: number }> {
    const { data, error } = await this.scopedQuery(organizationId).table(TABLE).select("status, next_attempt_at").gte("received_at", since.toISOString());
    if (error) throw new Error(error.message);
    const out = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<InboundAttachmentStatus, number> & { retrying: number };
    out.retrying = 0;
    for (const r of (data ?? []) as unknown as { status: InboundAttachmentStatus; next_attempt_at: string | null }[]) {
      out[r.status] = (out[r.status] ?? 0) + 1;
      if (r.status === "read_error" && r.next_attempt_at) out.retrying++;
    }
    return out;
  }
}
