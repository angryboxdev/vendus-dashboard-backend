import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface OrganizationIdentityReadPort {
  /** Returns the organization's own tax id (NIF), or null if not configured. */
  getNif(organizationId: OrganizationId): Promise<string | null>;
  /** Fuso horário IANA da organização (data civil para «Em atraso»); por omissão Europe/Lisbon. */
  getTimezone(organizationId: OrganizationId): Promise<string>;
}
