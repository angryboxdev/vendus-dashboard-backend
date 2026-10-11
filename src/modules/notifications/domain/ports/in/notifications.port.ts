import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Notification, NotifyCommand } from "../../entities/notification.js";

/** Entrada: usado por outros módulos (via composition root) e pela API /me. */
export interface NotificationsPort {
  notify(org: OrganizationId, cmd: NotifyCommand): Promise<number>;
  listMine(org: OrganizationId, userId: string, opts: { unreadOnly: boolean; limit: number }): Promise<Notification[]>;
  unreadCount(org: OrganizationId, userId: string): Promise<number>;
  markRead(org: OrganizationId, userId: string, id: string): Promise<void>;
  markAllRead(org: OrganizationId, userId: string): Promise<void>;
  /** Utilizadores Admin ativos (destinatários de avisos de governança). */
  adminUserIds(org: OrganizationId): Promise<string[]>;
}
