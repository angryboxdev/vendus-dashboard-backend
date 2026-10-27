import { createHash } from "node:crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { InboundAddress } from "../../domain/entities/inbound-address.js";
import type { InboundAttachment, InboundAttachmentStatus, IntakeDestination } from "../../domain/entities/inbound-attachment.js";
import type {
  InboundAddressLookupPort,
  InboundAddressRepositoryPort,
  InboundAttachmentRepositoryPort,
  InboundEventStorePort,
  IntakeSettingsRepositoryPort,
  InvoiceIntakePort,
  InvoiceIntakeResult,
  NewInboundAttachment,
  RandomBytesPort,
  ReceivedAttachmentInfo,
  ResendReceivingPort,
} from "../../domain/ports/out/email-intake.out-ports.js";

// Dados fictícios. Simulações em memória das portas de saída (sem base de dados nem rede).

export class FakeAddressStore implements InboundAddressRepositoryPort, InboundAddressLookupPort {
  readonly rows: Array<InboundAddress & { organizationId: OrganizationId }> = [];
  private seq = 0;

  seed(organizationId: OrganizationId, localPart: string, over: Partial<InboundAddress> = {}): InboundAddress {
    const a: InboundAddress = {
      id: `addr-${++this.seq}`,
      localPart,
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      createdBy: "teste",
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null,
      ...over,
    };
    this.rows.push({ ...a, organizationId });
    return a;
  }

  async listAll(organizationId: OrganizationId): Promise<InboundAddress[]> {
    return this.rows.filter((r) => r.organizationId === organizationId);
  }

  async rotate(organizationId: OrganizationId, localPart: string, actor: string, reason: string | null): Promise<InboundAddress> {
    if (this.rows.some((r) => r.localPart === localPart)) throw new Error("duplicate key value violates unique constraint");
    const now = new Date();
    for (const r of this.rows) {
      if (r.organizationId === organizationId && r.status === "active") Object.assign(r, { status: "inactive", deactivatedAt: now, deactivatedBy: actor, deactivationReason: reason });
    }
    return this.seed(organizationId, localPart, { createdAt: now, createdBy: actor });
  }

  async findByLocalPart(localPart: string) {
    const r = this.rows.find((x) => x.localPart === localPart);
    if (!r) return null;
    const { organizationId, ...address } = r;
    return { organizationId, address };
  }
}

export class FakeEventStore implements InboundEventStorePort {
  readonly events: Array<{ id: string; webhookId: string; emailId: string; receivedAt: Date; status: string; organizationId: OrganizationId | null; reason: string | null; attachmentsAccepted: number }> = [];

  async record(e: { webhookId: string; emailId: string; receivedAt: Date }) {
    const existing = this.events.find((x) => x.webhookId === e.webhookId || x.emailId === e.emailId);
    if (existing) return existing.status === "received" ? { kind: "resume" as const, eventId: existing.id } : { kind: "duplicate" as const };
    const id = `evt-${this.events.length + 1}`;
    this.events.push({ id, ...e, status: "received", organizationId: null, reason: null, attachmentsAccepted: 0 });
    return { kind: "new" as const, eventId: id };
  }

  async complete(eventId: string, r: Parameters<InboundEventStorePort["complete"]>[1]) {
    Object.assign(this.events.find((e) => e.id === eventId)!, { status: r.status, organizationId: r.organizationId, reason: r.reason, attachmentsAccepted: r.attachmentsAccepted });
  }

  async countWithoutPdf(organizationId: OrganizationId, since: Date) {
    return this.events.filter((e) => e.organizationId === organizationId && e.status === "accepted" && e.attachmentsAccepted === 0 && e.receivedAt >= since).length;
  }
}

export class FakeAttachmentRepo implements InboundAttachmentRepositoryPort {
  readonly rows: Array<InboundAttachment & { organizationId: OrganizationId }> = [];
  private seq = 0;
  private tick = 0;

  /** Hora de alteração sempre diferente (como o updated_at da base de dados). */
  private stamp(): Date {
    return new Date(Date.UTC(2026, 9, 1) + ++this.tick);
  }

  async insertMany(organizationId: OrganizationId, rows: NewInboundAttachment[]) {
    for (const r of rows) {
      if (this.rows.some((x) => x.emailId === r.emailId && x.attachmentId === r.attachmentId)) continue;
      const at = this.stamp();
      this.rows.push({
        ...r,
        organizationId,
        id: `att-${++this.seq}`,
        status: r.status ?? "received",
        invoiceId: null,
        fileSha256: null,
        errorCode: r.errorCode ?? null,
        errorMessage: r.errorMessage ?? null,
        attempts: 0,
        nextAttemptAt: null,
        lockedAt: null,
        createdAt: at,
        updatedAt: at,
      });
    }
  }

  async findDue(organizationId: OrganizationId, now: Date, staleBefore: Date, limit: number) {
    return this.rows
      .filter(
        (r) =>
          r.organizationId === organizationId &&
          (r.status === "received" ||
            (r.status === "read_error" && r.nextAttemptAt !== null && r.nextAttemptAt <= now) ||
            (r.status === "processing" && r.lockedAt !== null && r.lockedAt < staleBefore)),
      )
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async claim(organizationId: OrganizationId, a: InboundAttachment, now: Date) {
    const r = this.rows.find((x) => x.id === a.id && x.organizationId === organizationId);
    if (!r || r.status !== a.status || r.updatedAt.getTime() !== a.updatedAt.getTime()) return null;
    Object.assign(r, { status: "processing", lockedAt: now, attempts: a.attempts + 1, updatedAt: this.stamp() });
    return { ...r };
  }

  async update(organizationId: OrganizationId, a: InboundAttachment) {
    const r = this.rows.find((x) => x.id === a.id && x.organizationId === organizationId)!;
    Object.assign(r, { ...a, updatedAt: this.stamp() });
  }

  async listRecent(organizationId: OrganizationId, limit: number) {
    return this.rows.filter((r) => r.organizationId === organizationId).slice(-limit).reverse();
  }

  async countSince(organizationId: OrganizationId, since: Date) {
    const out = { received: 0, processing: 0, imported: 0, duplicate: 0, read_error: 0, rejected: 0, retrying: 0 } as Record<InboundAttachmentStatus, number> & { retrying: number };
    for (const r of this.rows) {
      if (r.organizationId !== organizationId || r.receivedAt < since) continue;
      out[r.status]++;
      if (r.status === "read_error" && r.nextAttemptAt) out.retrying++;
    }
    return out;
  }

  byOrg(organizationId: OrganizationId) {
    return this.rows.filter((r) => r.organizationId === organizationId);
  }
}

export class FakeSettings implements IntakeSettingsRepositoryPort {
  readonly destinations = new Map<OrganizationId, IntakeDestination>();
  async getDestination(organizationId: OrganizationId) {
    return this.destinations.get(organizationId) ?? "finance";
  }
  async setDestination(organizationId: OrganizationId, destination: IntakeDestination) {
    this.destinations.set(organizationId, destination);
  }
}

export const PDF_BYTES = Buffer.from("%PDF-1.7\n% fatura ficticia\n");

export class FakeResend implements ResendReceivingPort {
  /** emailId → anexos disponíveis na Resend. */
  readonly emails = new Map<string, ReceivedAttachmentInfo[]>();
  /** downloadUrl → conteúdo. */
  readonly files = new Map<string, Buffer>();
  /** Próximas N chamadas a listAttachments falham (falha passageira). */
  failListTimes = 0;
  listCalls = 0;

  addEmail(emailId: string, attachments: Array<{ id: string; filename: string; bytes?: Buffer }>) {
    this.emails.set(
      emailId,
      attachments.map((a) => {
        const url = `https://download.example.invalid/${emailId}/${a.id}`;
        this.files.set(url, a.bytes ?? PDF_BYTES);
        return { id: a.id, filename: a.filename, contentType: "application/pdf", size: (a.bytes ?? PDF_BYTES).length, downloadUrl: url };
      }),
    );
  }

  async listAttachments(emailId: string) {
    this.listCalls++;
    if (this.failListTimes > 0) {
      this.failListTimes--;
      throw new Error("Resend: falha ao listar anexos (HTTP 503).");
    }
    return this.emails.get(emailId) ?? [];
  }

  async download(url: string) {
    const bytes = this.files.get(url);
    if (!bytes) throw new Error("not found");
    return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  }
}

export class FakeIntake implements InvoiceIntakePort {
  readonly calls: Array<{ organizationId: OrganizationId; filename: string; destination: IntakeDestination }> = [];
  /** filename → resultado (predefinição: importada). */
  readonly outcomes = new Map<string, InvoiceIntakeResult | Error>();
  private seq = 0;

  async import(organizationId: OrganizationId, file: { bytes: Buffer; filename: string }, destination: IntakeDestination): Promise<InvoiceIntakeResult> {
    this.calls.push({ organizationId, filename: file.filename, destination });
    const o = this.outcomes.get(file.filename);
    if (o instanceof Error) throw o;
    return o ?? { outcome: "imported", invoiceIds: [`inv-${++this.seq}`] };
  }
}

export class FakeRandom implements RandomBytesPort {
  private n = 0;
  bytes(length: number): Uint8Array {
    this.n++;
    return Uint8Array.from({ length }, (_, i) => (i * 7 + this.n * 13) % 256);
  }
}
