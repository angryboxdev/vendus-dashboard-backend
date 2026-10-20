import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { EmployeeFileStoragePort } from "../../domain/ports/out/employee-file-storage.port.js";

export class FakeEmployeeFileStorage implements EmployeeFileStoragePort {
  readonly stored: Array<{ path: string }> = [];
  readonly removed: Array<{ path: string }> = [];
  private counter = 0;

  async store(_buffer: Buffer, filename: string, _mimeType: string, _organizationId: OrganizationId): Promise<string> {
    const path = `fake/document/${++this.counter}/${filename}`;
    this.stored.push({ path });
    return path;
  }

  async getSignedUrl(storagePath: string, ttlSeconds: number, _organizationId: OrganizationId): Promise<string> {
    return `https://fake.storage/document/${storagePath}?ttl=${ttlSeconds}`;
  }

  async remove(storagePath: string, _organizationId: OrganizationId): Promise<void> {
    this.removed.push({ path: storagePath });
  }
}
