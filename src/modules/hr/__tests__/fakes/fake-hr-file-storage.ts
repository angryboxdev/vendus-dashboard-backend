import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { HrFileStoragePort, HrStorageKind } from "../../domain/ports/out/hr-file-storage.port.js";

export class FakeHrFileStorage implements HrFileStoragePort {
  readonly stored: Array<{ kind: HrStorageKind; path: string }> = [];
  readonly removed: Array<{ kind: HrStorageKind; path: string }> = [];
  private counter = 0;

  async store(
    kind: HrStorageKind,
    _buffer: Buffer,
    filename: string,
    _mimeType: string,
    _organizationId: OrganizationId,
  ): Promise<string> {
    const path = `fake/${kind}/${++this.counter}/${filename}`;
    this.stored.push({ kind, path });
    return path;
  }

  async getSignedUrl(
    kind: HrStorageKind,
    storagePath: string,
    ttlSeconds: number,
    _organizationId: OrganizationId,
  ): Promise<string> {
    return `https://fake.storage/${kind}/${storagePath}?ttl=${ttlSeconds}`;
  }

  async remove(kind: HrStorageKind, storagePath: string, _organizationId: OrganizationId): Promise<void> {
    this.removed.push({ kind, path: storagePath });
  }
}
