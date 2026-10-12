import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Announcement, Receipt } from "../../domain/entities/announcement.js";
import type { AnnouncementsRepositoryPort } from "../../domain/ports/out/announcements.ports.js";

type Row = Record<string, unknown>;
type Res = { data: unknown; error: { message: string } | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());

const ANN = "id, status, audience, requires_confirmation, current_version, title, body, published_at, published_by, created_at";
const REC = "announcement_id, version, employee_id, delivered_at, read_at, confirmed_at";

const toAnn = (r: Row): Announcement => ({
  id: String(r.id),
  status: r.status as Announcement["status"],
  audience: r.audience as Announcement["audience"],
  requiresConfirmation: r.requires_confirmation === true,
  currentVersion: Number(r.current_version),
  title: String(r.title),
  body: String(r.body),
  publishedAt: iso(r.published_at),
  publishedBy: r.published_by ? String(r.published_by) : null,
  createdAt: iso(r.created_at)!,
});
const toRec = (r: Row): Receipt => ({
  announcementId: String(r.announcement_id),
  version: Number(r.version),
  employeeId: String(r.employee_id),
  deliveredAt: iso(r.delivered_at)!,
  readAt: iso(r.read_at),
  confirmedAt: iso(r.confirmed_at),
});

export class SupabaseAnnouncementsRepository implements AnnouncementsRepositoryPort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async list(org: OrganizationId) {
    return check<Row[]>(await this.scoped(org).table("announcements").select(ANN).order("created_at", { ascending: false }).limit(200)).map(toAnn);
  }
  async get(org: OrganizationId, id: string) {
    const r = check<Row | null>(await this.scoped(org).table("announcements").select(ANN).eq("id", id).maybeSingle());
    return r ? toAnn(r) : null;
  }
  async create(org: OrganizationId, a: Pick<Announcement, "audience" | "requiresConfirmation" | "title" | "body">, by: string) {
    const row = { audience: a.audience, requires_confirmation: a.requiresConfirmation, title: a.title, body: a.body, created_by: by };
    return toAnn(check(await this.scoped(org).table("announcements").insert(row).select(ANN).single()));
  }
  async update(org: OrganizationId, id: string, p: Partial<Pick<Announcement, "audience" | "requiresConfirmation" | "title" | "body" | "status" | "currentVersion" | "publishedAt" | "publishedBy">>) {
    const row: Row = {};
    if (p.audience !== undefined) row.audience = p.audience;
    if (p.requiresConfirmation !== undefined) row.requires_confirmation = p.requiresConfirmation;
    if (p.title !== undefined) row.title = p.title;
    if (p.body !== undefined) row.body = p.body;
    if (p.status !== undefined) row.status = p.status;
    if (p.currentVersion !== undefined) row.current_version = p.currentVersion;
    if (p.publishedAt !== undefined) row.published_at = p.publishedAt;
    if (p.publishedBy !== undefined) row.published_by = p.publishedBy;
    return toAnn(check(await this.scoped(org).table("announcements").update(row).eq("id", id).select(ANN).single()));
  }
  async insertVersion(org: OrganizationId, v: { announcementId: string; version: number; title: string; body: string }, by: string) {
    check(await this.scoped(org).table("announcement_versions").insert({ announcement_id: v.announcementId, version: v.version, title: v.title, body: v.body, created_by: by }));
  }
  async listVersions(org: OrganizationId, announcementId: string) {
    const rows = check<Row[]>(await this.scoped(org).table("announcement_versions").select("version, title, created_at, created_by").eq("announcement_id", announcementId).order("version"));
    return rows.map((r) => ({ version: Number(r.version), title: String(r.title), createdAt: iso(r.created_at)!, createdBy: String(r.created_by) }));
  }
  async insertRecipients(org: OrganizationId, announcementId: string, recipients: { employeeId: string; userId: string | null }[]) {
    if (!recipients.length) return;
    check(await this.scoped(org).table("announcement_recipients").insert(recipients.map((r) => ({ announcement_id: announcementId, employee_id: r.employeeId, user_id: r.userId }))));
  }
  async listRecipients(org: OrganizationId, announcementId: string) {
    const rows = check<Row[]>(await this.scoped(org).table("announcement_recipients").select("employee_id, user_id").eq("announcement_id", announcementId));
    return rows.map((r) => ({ employeeId: String(r.employee_id), userId: r.user_id ? String(r.user_id) : null }));
  }
  async recipientAnnouncements(org: OrganizationId, employeeId: string) {
    const rows = check<Row[]>(await this.scoped(org).table("announcement_recipients").select("announcement_id").eq("employee_id", employeeId));
    return rows.map((r) => String(r.announcement_id));
  }
  async insertReceipts(org: OrganizationId, announcementId: string, version: number, employeeIds: string[]) {
    if (!employeeIds.length) return;
    check(await this.scoped(org).table("announcement_receipts").insert(employeeIds.map((e) => ({ announcement_id: announcementId, version, employee_id: e }))));
  }
  async listReceipts(org: OrganizationId, announcementId: string) {
    return check<Row[]>(await this.scoped(org).table("announcement_receipts").select(REC).eq("announcement_id", announcementId)).map(toRec);
  }
  async markReceipt(org: OrganizationId, announcementId: string, version: number, employeeId: string, patch: { readAt?: string; confirmedAt?: string }) {
    const cur = check<Row | null>(await this.scoped(org).table("announcement_receipts").select(REC).eq("announcement_id", announcementId).eq("version", version).eq("employee_id", employeeId).maybeSingle());
    if (!cur) return null;
    const row: Row = {};
    // A primeira leitura fica; confirmar também marca como lido.
    if (patch.readAt && !cur.read_at) row.read_at = patch.readAt;
    if (patch.confirmedAt && !cur.confirmed_at) row.confirmed_at = patch.confirmedAt;
    if (!Object.keys(row).length) return toRec(cur);
    const rows = check<Row[]>(await this.scoped(org).table("announcement_receipts").update(row).eq("announcement_id", announcementId).eq("version", version).eq("employee_id", employeeId).select(REC));
    return rows[0] ? toRec(rows[0]) : null;
  }
}
