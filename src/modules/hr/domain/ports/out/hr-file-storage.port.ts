import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Documentos ficam num bucket privado (URL assinado curto, on-demand). Fotos também ficam privadas, mas com TTL mais longo (ver README — dado pessoal, RGPD). */
export type HrStorageKind = "document" | "photo";

export interface HrFileStoragePort {
  /** Devolve o `storagePath` real (pode vir prefixado por organização). */
  store(
    kind: HrStorageKind,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    organizationId: OrganizationId,
  ): Promise<string>;
  getSignedUrl(
    kind: HrStorageKind,
    storagePath: string,
    ttlSeconds: number,
    organizationId: OrganizationId,
  ): Promise<string>;
  remove(kind: HrStorageKind, storagePath: string, organizationId: OrganizationId): Promise<void>;
}
