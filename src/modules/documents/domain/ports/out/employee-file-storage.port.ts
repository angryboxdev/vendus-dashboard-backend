import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Ficheiros dos documentos de colaborador — bucket privado `hr-documents`, URL assinado curto e só a pedido. */
export interface EmployeeFileStoragePort {
  /** Devolve o caminho real onde o ficheiro ficou guardado. */
  store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string>;
  getSignedUrl(storagePath: string, ttlSeconds: number, organizationId: OrganizationId): Promise<string>;
  remove(storagePath: string, organizationId: OrganizationId): Promise<void>;
}
