import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { LearnedMappingReadPort, LearnedPackagingSnapshot } from "../../domain/ports/out/learned-mapping-read.port.js";

export class FakeLearnedMappingRead implements LearnedMappingReadPort {
  mappings: LearnedPackagingSnapshot[] = [];

  async findPackaging(_organizationId: OrganizationId, supplierId: string, stockItemId: string): Promise<LearnedPackagingSnapshot | null> {
    return this.mappings.find((m) => m.supplierId === supplierId && m.stockItemId === stockItemId) ?? null;
  }

  async findAllForItem(_organizationId: OrganizationId, stockItemId: string): Promise<LearnedPackagingSnapshot[]> {
    return this.mappings.filter((m) => m.stockItemId === stockItemId);
  }
}
