import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { Notification } from "../../domain/entities/notification.js";
import type { NotificationStorePort } from "../../domain/ports/out/notification-store.port.js";

type Res = { data: unknown; error: { message: string } | null; count?: number | null };
function check<T>(res: Res): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

interface Row {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
}
const COLS = "id, kind, title, body, link, created_at, read_at";
const toNotification = (r: Row): Notification => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, createdAt: r.created_at, readAt: r.read_at });

export class SupabaseNotificationStore implements NotificationStorePort {
  constructor(private readonly scoped: ScopedQueryFactory) {}

  async insert(org: OrganizationId, rows: { recipientUserId: string; kind: string; title: string; body: string | null; link: string | null; dedupeKey: string | null }[]) {
    const now = new Date().toISOString();
    const payload = rows.map((r) => ({
      recipient_user_id: r.recipientUserId,
      channel: "in_app",
      kind: r.kind,
      title: r.title,
      body: r.body,
      link: r.link,
      dedupe_key: r.dedupeKey,
      status: "sent",
      sent_at: now,
    }));
    const res = rows.some((r) => r.dedupeKey)
      ? await this.scoped(org).table("notifications").upsert(payload, { onConflict: "org_id,recipient_user_id,dedupe_key", ignoreDuplicates: true }).select("id")
      : await this.scoped(org).table("notifications").insert(payload).select("id");
    return check<unknown[]>(res).length;
  }

  async list(org: OrganizationId, userId: string, opts: { unreadOnly: boolean; limit: number }) {
    let q = this.scoped(org).table("notifications").select(COLS).eq("recipient_user_id", userId).eq("channel", "in_app");
    if (opts.unreadOnly) q = q.is("read_at", null);
    return check<Row[]>(await q.order("created_at", { ascending: false }).limit(opts.limit)).map(toNotification);
  }

  async countUnread(org: OrganizationId, userId: string) {
    const res = await this.scoped(org).table("notifications").select("id", { count: "exact", head: true }).eq("recipient_user_id", userId).eq("channel", "in_app").is("read_at", null);
    if (res.error) throw new Error(res.error.message);
    return res.count ?? 0;
  }

  async markRead(org: OrganizationId, userId: string, id: string | null) {
    let q = this.scoped(org).table("notifications").update({ read_at: new Date().toISOString(), status: "read" }).eq("recipient_user_id", userId).is("read_at", null);
    if (id) q = q.eq("id", id);
    check(await q);
  }

  async activeAdmins(org: OrganizationId) {
    const q = this.scoped(org);
    const [members, admins] = await Promise.all([
      q.table("org_members").select("user_id, profile_id, role, status").eq("status", "active"),
      q.table("access_profiles").select("id").eq("system_key", "admin"),
    ]);
    const adminProfile = new Set(check<{ id: string }[]>(admins).map((p) => p.id));
    return check<{ user_id: string; profile_id: string | null; role: string }[]>(members)
      .filter((m) => (m.profile_id ? adminProfile.has(m.profile_id) : m.role === "admin"))
      .map((m) => m.user_id);
  }
}
