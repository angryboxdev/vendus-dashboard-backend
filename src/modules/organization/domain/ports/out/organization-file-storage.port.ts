import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Ficheiros da organização (hoje só o logotipo) — bucket privado, servido por URL assinado. */
export interface OrganizationFileStoragePort {
  /** Devolve o caminho real onde o ficheiro ficou guardado. */
  store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string>;
  getSignedUrl(storagePath: string, ttlSeconds: number, organizationId: OrganizationId): Promise<string>;
}
