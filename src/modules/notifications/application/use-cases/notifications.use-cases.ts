import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { validateNotify, type NotifyCommand } from "../../domain/entities/notification.js";
import type { NotificationsPort } from "../../domain/ports/in/notifications.port.js";
import type { NotificationStorePort } from "../../domain/ports/out/notification-store.port.js";

export class NotificationsUseCases implements NotificationsPort {
  constructor(private readonly store: NotificationStorePort) {}

  async notify(org: OrganizationId, cmd: NotifyCommand): Promise<number> {
    validateNotify(cmd);
    const recipients = [...new Set(cmd.recipientUserIds.filter(Boolean))];
    if (recipients.length === 0) return 0;
    return this.store.insert(
      org,
      recipients.map((recipientUserId) => ({
        recipientUserId,
        kind: cmd.kind,
        title: cmd.title.trim(),
        body: cmd.body?.trim() || null,
        link: cmd.link ?? null,
        dedupeKey: cmd.dedupeKey ?? null,
      })),
    );
  }

  listMine(org: OrganizationId, userId: string, opts: { unreadOnly: boolean; limit: number }) {
    return this.store.list(org, userId, { unreadOnly: opts.unreadOnly, limit: Math.min(Math.max(opts.limit, 1), 200) });
  }

  unreadCount(org: OrganizationId, userId: string) {
    return this.store.countUnread(org, userId);
  }

  markRead(org: OrganizationId, userId: string, id: string) {
    return this.store.markRead(org, userId, id);
  }

  markAllRead(org: OrganizationId, userId: string) {
    return this.store.markRead(org, userId, null);
  }

  adminUserIds(org: OrganizationId) {
    return this.store.activeAdmins(org);
  }
}
