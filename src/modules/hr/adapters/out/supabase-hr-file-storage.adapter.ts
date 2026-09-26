import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { objectStorage, type StorageBucketName } from "../../../../infra/scoped-db/object-storage.js";
import type { HrFileStoragePort, HrStorageKind } from "../../domain/ports/out/hr-file-storage.port.js";

const BUCKET_BY_KIND: Record<HrStorageKind, StorageBucketName> = {
  document: "hr-documents",
  photo: "hr-photos",
};

export class SupabaseHrFileStorageAdapter implements HrFileStoragePort {
  async store(
    kind: HrStorageKind,
    buffer: Buffer,
    filename: string,
    mimeType: string,
    organizationId: OrganizationId,
  ): Promise<string> {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${randomUUID()}/${safeName}`;
    return objectStorage.upload(BUCKET_BY_KIND[kind], path, buffer, mimeType, organizationId);
  }

  async getSignedUrl(
    kind: HrStorageKind,
    storagePath: string,
    ttlSeconds: number,
    organizationId: OrganizationId,
  ): Promise<string> {
    return objectStorage.createSignedUrl(BUCKET_BY_KIND[kind], storagePath, ttlSeconds, organizationId);
  }

  async remove(kind: HrStorageKind, storagePath: string, _organizationId: OrganizationId): Promise<void> {
    await objectStorage.remove(BUCKET_BY_KIND[kind], storagePath);
  }
}
