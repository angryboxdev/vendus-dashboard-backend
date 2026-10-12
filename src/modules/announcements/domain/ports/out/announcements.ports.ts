import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Announcement, Audience, Receipt } from "../../entities/announcement.js";

export interface AnnouncementsRepositoryPort {
  list(org: OrganizationId): Promise<Announcement[]>;
  get(org: OrganizationId, id: string): Promise<Announcement | null>;
  create(org: OrganizationId, a: Pick<Announcement, "audience" | "requiresConfirmation" | "title" | "body">, by: string): Promise<Announcement>;
  update(org: OrganizationId, id: string, patch: Partial<Pick<Announcement, "audience" | "requiresConfirmation" | "title" | "body" | "status" | "currentVersion" | "publishedAt" | "publishedBy">>): Promise<Announcement>;
  insertVersion(org: OrganizationId, v: { announcementId: string; version: number; title: string; body: string }, by: string): Promise<void>;
  listVersions(org: OrganizationId, announcementId: string): Promise<{ version: number; title: string; createdAt: string; createdBy: string }[]>;
  insertRecipients(org: OrganizationId, announcementId: string, recipients: { employeeId: string; userId: string | null }[]): Promise<void>;
  listRecipients(org: OrganizationId, announcementId: string): Promise<{ employeeId: string; userId: string | null }[]>;
  recipientAnnouncements(org: OrganizationId, employeeId: string): Promise<string[]>;
  insertReceipts(org: OrganizationId, announcementId: string, version: number, employeeIds: string[]): Promise<void>;
  listReceipts(org: OrganizationId, announcementId: string): Promise<Receipt[]>;
  markReceipt(org: OrganizationId, announcementId: string, version: number, employeeId: string, patch: { readAt?: string; confirmedAt?: string }): Promise<Receipt | null>;
}

export interface AnnouncementsContextPort {
  /** Resolve o público em colaboradores ativos (com a conta, se tiverem). */
  resolveAudience(org: OrganizationId, audience: Audience): Promise<{ employeeId: string; userId: string | null }[]>;
  employeeForUser(org: OrganizationId, userId: string): Promise<string | null>;
  notify(org: OrganizationId, userIds: string[], n: { title: string; body: string; link: string; dedupeKey: string }): Promise<void>;
  now(): string;
  audit(org: OrganizationId, e: { actor: string; action: string; resourceId: string; after: unknown }): Promise<void>;
}
