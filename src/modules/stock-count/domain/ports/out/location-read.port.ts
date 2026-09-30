import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface LocationSnapshot {
  id: string;
  name: string;
  isActive: boolean;
}

/** D10 — wrapper fino sobre `locations`' `ListLocationsPort` (mesmo padrão de `stock-purchase-review`). */
export interface LocationReadPort {
  listActive(organizationId: OrganizationId): Promise<LocationSnapshot[]>;
}
