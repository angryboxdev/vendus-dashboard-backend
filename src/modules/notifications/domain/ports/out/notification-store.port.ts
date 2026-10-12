import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Notification } from "../../entities/notification.js";

/** Saída: persistência. */
export interface NotificationStorePort {
  /** Insere as linhas (canal na app, já entregues); duplicados por `dedupeKey` são ignorados. Devolve quantas entraram. */
  insert(org: OrganizationId, rows: { recipientUserId: string; kind: string; title: string; body: string | null; link: string | null; dedupeKey: string | null }[]): Promise<number>;
  list(org: OrganizationId, userId: string, opts: { unreadOnly: boolean; limit: number }): Promise<Notification[]>;
  countUnread(org: OrganizationId, userId: string): Promise<number>;
  markRead(org: OrganizationId, userId: string, id: string | null): Promise<void>;
  activeAdmins(org: OrganizationId): Promise<string[]>;
}
