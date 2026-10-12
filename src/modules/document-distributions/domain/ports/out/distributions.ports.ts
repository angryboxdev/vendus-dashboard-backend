import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Audience, Distribution, DistributionRecipient } from "../../entities/distribution.js";

export interface DistributionsRepositoryPort {
  list(org: OrganizationId): Promise<Distribution[]>;
  get(org: OrganizationId, id: string): Promise<(Distribution & { storagePath: string }) | null>;
  create(org: OrganizationId, d: Omit<Distribution, "id" | "status" | "createdAt"> & { storagePath: string }): Promise<Distribution>;
  setStatus(org: OrganizationId, id: string, status: Distribution["status"]): Promise<void>;
  insertRecipients(org: OrganizationId, distributionId: string, recipients: { employeeId: string; userId: string | null }[]): Promise<void>;
  listRecipients(org: OrganizationId, distributionId: string): Promise<DistributionRecipient[]>;
  /** Todas as linhas de destinatário (para as estatísticas da lista). */
  listAllRecipients(org: OrganizationId, distributionIds: string[]): Promise<DistributionRecipient[]>;
  recipientRows(org: OrganizationId, employeeId: string): Promise<DistributionRecipient[]>;
  mark(org: OrganizationId, distributionId: string, employeeId: string, patch: { readAt?: string; confirmedAt?: string }): Promise<DistributionRecipient | null>;
}

/** Ficheiros dos envios — bucket privado, URL assinado de curta duração. */
export interface DistributionFilesPort {
  store(org: OrganizationId, buffer: Buffer, fileName: string, mimeType: string): Promise<string>;
  signedUrl(org: OrganizationId, storagePath: string, fileName: string): Promise<string>;
}

export interface DistributionsContextPort {
  /** Colaboradores ativos do público (com a conta, se tiverem). */
  resolveAudience(org: OrganizationId, audience: Audience): Promise<{ employeeId: string; userId: string | null }[]>;
  employeeForUser(org: OrganizationId, userId: string): Promise<string | null>;
  employeeNames(org: OrganizationId): Promise<Map<string, string>>;
  notify(org: OrganizationId, userIds: string[], n: { title: string; body: string; link: string; dedupeKey: string }): Promise<void>;
  now(): string;
  audit(org: OrganizationId, e: { actor: string; action: string; resourceId: string; after: unknown }): Promise<void>;
}
