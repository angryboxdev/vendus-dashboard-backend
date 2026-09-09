import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface DocumentStoragePort {
  store(buffer: Buffer, filename: string, mimeType: string, organizationId: OrganizationId): Promise<string>;
}
