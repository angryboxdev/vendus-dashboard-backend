import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/**
 * Mirror de `HrFileStoragePort` (módulo `hr`) — privado, URL sempre assinada
 * on-demand, nunca pública (ao contrário de `invoices`, que usa URL pública
 * hoje). Só um "kind" nesta fase (anexo de despesa de sócio/plataforma).
 */
export interface AccountingDocumentStoragePort {
  /** Devolve o `storagePath` real (pode vir prefixado por organização). */
  store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string>;
  getSignedUrl(storagePath: string, ttlSeconds: number, organizationId: OrganizationId): Promise<string>;
  remove(storagePath: string, organizationId: OrganizationId): Promise<void>;
}
