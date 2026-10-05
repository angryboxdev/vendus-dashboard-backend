import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Ficheiros dos documentos da Empresa — bucket privado, servido por URL assinado de curta duração. */
export interface DocumentFileStoragePort {
  /** Devolve o caminho real onde o ficheiro ficou guardado. */
  store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string>;
  getSignedUrl(storagePath: string, ttlSeconds: number, organizationId: OrganizationId): Promise<string>;
}
